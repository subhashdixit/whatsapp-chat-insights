import {analyzeChat} from './parser.js';
self.onmessage = event => {
  try { self.postMessage({result: analyzeChat(event.data.text, {dateOrder:event.data.dateOrder})}); }
  catch (error) { self.postMessage({error:error.message}); }
};
