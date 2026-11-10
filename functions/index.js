'use strict';

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { buildCallables } = require('./src/callable-factory.cjs');

if (getApps().length === 0) initializeApp();
const db = getFirestore();
Object.assign(exports, buildCallables({ db }));
