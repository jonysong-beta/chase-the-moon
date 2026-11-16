'use strict';

// timeoutMs covers the initial show/load/retry sequence. An acknowledged video
// has its own longer watchdog; neither timeout ever grants a reward.
const LOAD_TIMEOUT_MS = 15000;
const CLOSE_TIMEOUT_MS = 180000;

function createRewardedAd(options) {
  options = options || {};
  const platform = options.wx;
  const unit = typeof options.adUnitId === 'string' ? options.adUnitId.trim() : '';
  const configured = !!(unit && platform && typeof platform.createRewardedVideoAd === 'function');
  const timeout = typeof options.timeoutMs === 'number' && isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, 60000) : LOAD_TIMEOUT_MS;
  const usedInstances = new WeakSet();
  let destroyed = false;
  let disabled = false;
  let active = null;
  let sequence = 0;

  // Only fixed event names and non-identifying request/status/code fields leave
  // this module. Platform error messages and advertising IDs are not recorded.
  function emit(name, request, result) {
    if (typeof options.onEvent !== 'function') return;
    const payload = { requestId: request.id };
    if (result) {
      payload.status = result.status;
      if (result.code) payload.code = result.code;
    }
    try { options.onEvent(name, payload); } catch (error) { /* Telemetry cannot block cleanup. */ }
  }

  function isCurrent(request) {
    return active === request && !request.settled;
  }

  function errorCode(error) {
    const value = error && error.errCode;
    if (typeof value === 'number' && isFinite(value)) return String(value);
    if (typeof value === 'string' && /^\d{1,8}$/.test(value)) return value;
    return 'ad_error';
  }

  function cleanup(request) {
    clearTimeout(request.timer);
    request.bindings.forEach(binding => {
      try { request.ad[binding.off](binding.callback); } catch (error) { /* Retired callbacks remain token-guarded. */ }
    });
    request.bindings = [];
    if (request.ad && typeof request.ad.destroy === 'function') {
      try { request.ad.destroy(); } catch (error) { /* A retired instance is never reused. */ }
    }
  }

  function finish(request, status, code) {
    if (!isCurrent(request)) return;
    request.settled = true;
    const result = { status };
    if (code) result.code = code;
    cleanup(request);
    active = null;
    emit('ad_result', request, result);
    request.resolve(result);
  }

  function fail(request, error) {
    const code = errorCode(error);
    finish(request, code === '1004' ? 'unavailable' : 'error', code);
  }

  function armTimeout(request, milliseconds, code) {
    clearTimeout(request.timer);
    request.timer = setTimeout(() => finish(request, 'error', code), milliseconds);
  }

  function call(ad, method) {
    try { return Promise.resolve(ad[method]()); } catch (error) { return Promise.reject(error); }
  }

  function showAttempt(request, retried) {
    if (!isCurrent(request)) return;
    call(request.ad, 'show').then(() => {
      if (!isCurrent(request)) return;
      request.showing = true;
      armTimeout(request, CLOSE_TIMEOUT_MS, 'close_timeout');
      emit('ad_shown', request);
    }, error => {
      if (!isCurrent(request)) return;
      if (retried || errorCode(error) === '1004' || typeof request.ad.load !== 'function') {
        fail(request, error);
        return;
      }
      emit('ad_retry', request);
      call(request.ad, 'load').then(() => showAttempt(request, true), loadError => fail(request, loadError));
    });
  }

  function show() {
    if (destroyed || disabled || !configured) {
      return Promise.resolve({ status: 'unavailable', code: destroyed ? 'destroyed' : disabled ? 'instance_reused' : 'not_configured' });
    }
    if (active) return Promise.resolve({ status: 'busy' });
    return new Promise(resolve => {
      const request = { id: ++sequence, resolve, settled: false, showing: false, ad: null, bindings: [], timer: null };
      active = request;
      try {
        // multiton (SDK >= 2.8.0) isolates native events between attempts. Keep
        // only one live instance, then detach and destroy it on every outcome.
        request.ad = platform.createRewardedVideoAd({ adUnitId: unit, disableFallbackSharePage: true, multiton: true });
        const ad = request.ad;
        if (!ad || typeof ad !== 'object' || ['show', 'onClose', 'offClose', 'onError', 'offError'].some(name => typeof ad[name] !== 'function')) {
          finish(request, 'error', 'invalid_api');
          return;
        }
        if (usedInstances.has(ad)) {
          // A recycled native instance could route an old untagged close to the
          // new attempt. Disable safely rather than risk an unearned revive.
          disabled = true;
          request.ad = null;
          finish(request, 'unavailable', 'instance_reused');
          return;
        }
        usedInstances.add(ad);
        const onClose = result => {
          const fallback = result && (result.isFallbackShare === true || result.isFallback === true || result.isShare === true);
          const complete = request.showing && result && result.isEnded === true && !fallback;
          finish(request, complete ? 'completed' : 'cancelled');
        };
        const onError = error => fail(request, error);
        request.bindings.push({ off: 'offClose', callback: onClose });
        ad.onClose(onClose);
        if (!isCurrent(request)) return;
        request.bindings.push({ off: 'offError', callback: onError });
        ad.onError(onError);
        if (!isCurrent(request)) return;
        armTimeout(request, timeout, 'load_timeout');
        emit('ad_request', request);
        showAttempt(request, false);
      } catch (error) {
        fail(request, error);
      }
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (active) finish(active, 'unavailable', 'destroyed');
  }

  return { show, isConfigured: () => configured && !destroyed && !disabled, destroy };
}

module.exports = createRewardedAd;
