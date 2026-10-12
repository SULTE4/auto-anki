import { handleUrl, onAlarm } from './src/flow.js';

const filters = { url: [{ hostContains: 'google.', pathEquals: '/search' }] };
// Google swaps the URL in place when you search again from a results page, hence onHistoryStateUpdated.
const onNavigate = ({ url, frameId }) => frameId === 0 && handleUrl(url).catch(console.error);

chrome.webNavigation.onCommitted.addListener(onNavigate, filters);
chrome.webNavigation.onHistoryStateUpdated.addListener(onNavigate, filters);
chrome.alarms.onAlarm.addListener(alarm => onAlarm(alarm).catch(console.error));
chrome.alarms.get('flush').then(a => a || chrome.alarms.create('flush', { periodInMinutes: 5 }));
