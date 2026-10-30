/** Browser/Node-compatible chat parser. No network, storage, or DOM access. */
const HEADER = /^\[?(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]?\s*(?:-\s*)?(.*)$/i;
const DATE_START = /^\[?\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/;
const STOP_WORDS = new Set('the and this that with have from your you are for not but was were will just hai hain nahi bhi kya mein to of in on is it a an be'.split(' '));

export function parseHeader(line, dateOrder = 'DMY') {
  if (!['DMY','MDY'].includes(dateOrder)) throw new Error('Choose DMY or MDY date order.');
  const clean = line.replace(/^[\u200e\u200f\ufeff]+/, '').replaceAll('\u202f', ' ').replaceAll('\u00a0', ' ');
  const match = clean.match(HEADER);
  if (!match) return null;
  const parts = match[1].split(/[/.\-]/).map(Number);
  const day = dateOrder === 'DMY' ? parts[0] : parts[1];
  const month = dateOrder === 'DMY' ? parts[1] : parts[0];
  let year = parts[2]; if (year < 100) year += year < 70 ? 2000 : 1900;
  let hour = Number(match[2]); const minute = Number(match[3]), second = Number(match[4] || 0), marker = match[5]?.toUpperCase();
  if (marker) { if (hour < 1 || hour > 12) return {invalid: true}; hour = hour % 12 + (marker === 'PM' ? 12 : 0); }
  if (year < 1900 || year > 2100 || hour > 23 || minute > 59 || second > 59) return {invalid: true};
  const stamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (stamp.getUTCFullYear() !== year || stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) return {invalid: true};
  return {date: stamp.toISOString().slice(0,10), hour, content: match[6]};
}

export function emojiTokens(text) {
  const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('en', {granularity:'grapheme'}).segment(text)].map(item => item.segment) : Array.from(text);
  return segments.filter(token => /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(token));
}

export function analyzeChat(text, {dateOrder = 'DMY', maxMessages = 100000} = {}) {
  if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) throw new Error('Use a text export up to 10 MiB.');
  if (!['DMY','MDY'].includes(dateOrder)) throw new Error('Choose DMY or MDY date order.');
  const lines = text.split(/\r?\n/);
  if (lines.length > 200000) throw new Error('Maximum 200,000 lines per analysis.');
  const names = new Map(), buckets = new Map(), words = new Map(), emojis = new Map();
  const stats = {messages:0,system_entries:0,unparsed_lines:0,invalid_headers:0,continuation_lines:0};
  let current = null;
  function commit() {
    if (!current) return;
    stats.messages++;
    if (stats.messages > maxMessages) throw new Error('Maximum 100,000 messages per analysis.');
    if (!names.has(current.name)) {
      if (names.size >= 5000) throw new Error('Maximum 5,000 participants per analysis.');
      names.set(current.name, `p${names.size + 1}`);
    }
    const id = names.get(current.name), key = `${current.date}|${id}`;
    if (!buckets.has(key)) buckets.set(key,{date:current.date,participant:id,messages:0,words:0,media:0,emojis:0,hours:Array(24).fill(0)});
    const bucket = buckets.get(key);
    const tokens = current.body.match(/\p{L}[\p{L}\p{M}']*/gu) || [];
    const emoji = emojiTokens(current.body);
    bucket.messages++; bucket.words += tokens.length; bucket.emojis += emoji.length; bucket.hours[current.hour]++;
    bucket.media += /<media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted/i.test(current.body) ? 1 : 0;
    for (const token of tokens.map(value => value.toLocaleLowerCase())) if (token.length > 2 && !STOP_WORDS.has(token)) words.set(token,(words.get(token)||0)+1);
    for (const token of emoji) emojis.set(token,(emojis.get(token)||0)+1);
    current = null;
  }
  for (const original of lines) {
    const line = original.replace(/^[\u200e\u200f\ufeff]+/, '');
    const header = parseHeader(line,dateOrder);
    if (header) {
      commit();
      if (header.invalid) { stats.invalid_headers++; continue; }
      const split = header.content.indexOf(': ');
      if (split < 1) { stats.system_entries++; continue; }
      current = {name:header.content.slice(0,split),body:header.content.slice(split+2),date:header.date,hour:header.hour};
    } else if (DATE_START.test(line)) {
      commit(); stats.invalid_headers++;
    } else if (current && line.trim()) {
      current.body += '\n' + line; stats.continuation_lines++;
    } else if (line.trim()) stats.unparsed_lines++;
  }
  commit();
  if (!stats.messages) throw new Error('No supported messages found. Check DMY/MDY and use a supported English timestamp text export.');
  const top = map => [...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,30).map(([label,value])=>({label,value}));
  return {stats,participants:[...names].map(([name,id])=>({id,name,alias:`Participant ${id.slice(1)}`})),
    buckets:[...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)),top_words:top(words),top_emojis:top(emojis)};
}

export function filterSummary(analysis, {participant='all',start='',end=''} = {}) {
  const buckets = analysis.buckets.filter(row=>(participant==='all'||row.participant===participant)&&(!start||row.date>=start)&&(!end||row.date<=end));
  const participants = new Map(), months = new Map(), hours = Array(24).fill(0);
  const totals = {messages:0,words:0,media:0,emojis:0};
  for (const row of buckets) {
    if (!participants.has(row.participant)) participants.set(row.participant,{id:row.participant,messages:0,words:0,media:0,emojis:0});
    const item = participants.get(row.participant);
    for (const key of Object.keys(totals)) { totals[key]+=row[key]; item[key]+=row[key]; }
    const month=row.date.slice(0,7); months.set(month,(months.get(month)||0)+row.messages);
    row.hours.forEach((count,index)=>hours[index]+=count);
  }
  return {totals,participants:[...participants.values()].sort((a,b)=>b.messages-a.messages),
    months:[...months].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,value])=>({label,value})),
    hours:hours.map((value,index)=>({label:String(index).padStart(2,'0')+':00',value}))};
}
