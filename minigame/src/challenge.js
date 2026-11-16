'use strict';

const Daily = require('./daily');

function encodeShareQuery(content) {
  if (!content || typeof content !== 'object') return '';
  if (content.mode === 'endless' || content.mode === 'meditation') return 'view=' + content.mode;
  if (content.mode !== 'daily' || !Daily.validDate(content.date) || ['A', 'B', 'C'].indexOf(content.pool) < 0 ||
      typeof content.version !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(content.version)) return '';
  return ['route=daily', 'date=' + content.date, 'pool=' + content.pool, 'version=' + encodeURIComponent(content.version)].join('&');
}

function resolveShareQuery(query, now) {
  if (query === null || query === undefined) return { status: 'none' };
  if (typeof query !== 'object' || Array.isArray(query)) return { status: 'invalid' };
  if (Object.keys(query).length === 0) return { status: 'none' };
  const view = query.view;
  if (typeof view === 'string') {
    if (Object.keys(query).length !== 1 || ['endless', 'meditation'].indexOf(view) < 0) return { status: 'invalid' };
    return { status: view };
  }
  if (Object.keys(query).length !== 4 || query.route !== 'daily' || !Daily.validDate(query.date) ||
      ['A', 'B', 'C'].indexOf(query.pool) < 0 || typeof query.version !== 'string' ||
      !/^[A-Za-z0-9_.-]{1,64}$/.test(query.version)) return { status: 'invalid' };
  const route = Daily.createRun(now, query.pool);
  if (!route || query.date !== route.date || query.version !== route.version) return { status: 'expired' };
  return { status: 'daily', date: query.date, pool: query.pool, version: query.version };
}

module.exports = { encodeShareQuery, resolveShareQuery };
