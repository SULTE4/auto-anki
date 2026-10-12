import { handleUrl, onAlarm, onMessage } from './src/flow.js';

const filters = { url: [{ hostEquals: 'www.google.com', pathEquals: '/search' }] };
// Google swaps the URL in place when you search again from a results page, hence onHistoryStateUpdated.
const onNavigate = ({ url, tabId, frameId }) => frameId === 0 && handleUrl(url, tabId).catch(console.error);

chrome.webNavigation.onCommitted.addListener(onNavigate, filters);
chrome.webNavigation.onHistoryStateUpdated.addListener(onNavigate, filters);
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const reply = sender.id === chrome.runtime.id && onMessage(msg);
  if (!reply) return;
  reply.then(sendResponse, e => { console.error(e); sendResponse(); });
  return true; // keep the channel open for the async reply
});
chrome.alarms.onAlarm.addListener(alarm => onAlarm(alarm).catch(console.error));
chrome.alarms.get('flush').then(a => a || chrome.alarms.create('flush', { periodInMinutes: 5 }));
