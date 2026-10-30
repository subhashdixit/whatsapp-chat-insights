import {element,metric,number,barChart,lineChart,table,downloadCsv} from './charts.js';
import {filterSummary} from './parser.js';
const get=id=>document.getElementById(id);
let analysis=null, worker=null, exported=[], generation=0;
function showError(message) { get('error').textContent=message; get('error').hidden=false; get('status').textContent='Analysis not completed.'; }
function label(id) { const person=analysis.participants.find(item=>item.id===id); return get('names').checked?person.name:person.alias; }
function render() {
  if (!analysis) return;
  const summary=filterSummary(analysis,{participant:get('participant').value,start:get('start').value,end:get('end').value});
  get('metrics').replaceChildren(metric('Messages',number(summary.totals.messages)),metric('Words',number(summary.totals.words)),metric('Media markers',number(summary.totals.media)),metric('Emoji graphemes',number(summary.totals.emojis)));
  barChart(get('participants'),summary.participants.slice(0,20).map(row=>({label:label(row.id),value:row.messages})),'Messages by participant');
  lineChart(get('months'),summary.months,'Messages per month');
  barChart(get('hours'),summary.hours,'Messages by export wall-clock hour');
  table(get('participant-table'),['Participant','Messages','Words','Media markers','Emoji graphemes'],summary.participants.map(row=>[label(row.id),row.messages,row.words,row.media,row.emojis]));
  exported=summary.participants.map(row=>[analysis.participants.find(person=>person.id===row.id).alias,row.messages,row.words,row.media,row.emojis]);
  const prior=get('participant').value;
  get('participant').replaceChildren();
  const all=element('option','All participants');all.value='all';get('participant').append(all);
  for (const person of analysis.participants) { const option=element('option',get('names').checked?person.name:person.alias);option.value=person.id;get('participant').append(option); }
  get('participant').value=prior;
}
function run(text,sourceLabel,token=++generation) {
  if (worker) worker.terminate();
  analysis=null;exported=[];get("explore").hidden=true;get("names").checked=false;
  for(const id of ["metrics","participants","months","hours","words","emojis","participant-table"])get(id).replaceChildren();
  get('error').hidden=true;get('status').textContent='Parsing locally in a browser worker…';
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
    if (token!==generation) return;
    worker.terminate();worker=null;
    if (event.data.error) { showError(event.data.error);return; }
    analysis=event.data.result;
    get('names').checked=false;get('participant').value='all';get('start').value='';get('end').value='';
    get('explore').hidden=false;get('dataset-label').textContent=sourceLabel;
    const stats=analysis.stats;
    get('coverage').textContent=`Parsed ${number(stats.messages)} messages; ${number(stats.system_entries)} system entries; ${number(stats.continuation_lines)} continuation lines; ${number(stats.invalid_headers)} invalid/unsupported headers; ${number(stats.unparsed_lines)} other unparsed lines. Inspect these counts before trusting totals.`;
    barChart(get('words'),analysis.top_words.slice(0,15),'Full-chat word frequencies');
    barChart(get('emojis'),analysis.top_emojis.slice(0,15),'Full-chat emoji frequencies');
    get('status').textContent='Analysis complete. Chat text was processed locally; only aggregates are shown.';
    render();
  };
  worker.onerror=()=>{if(token!==generation)return;worker?.terminate();worker=null;showError('The local parser failed. Check the file format and input limits.');};
  worker.postMessage({text,dateOrder:get('date-order').value});
}
get('analyze').addEventListener('click',async()=>{
  const token=++generation;worker?.terminate();worker=null;
  try {
    const file=get('file').files[0];if(!file)throw new Error('Choose a text export first.');
    if(file.size>10*1024*1024)throw new Error('Maximum file size is 10 MiB.');
    const text=await file.text();if(token!==generation)return;
    run(text,'Your local file · no upload to the hosting server',token);
  }catch(error){showError(error.message);}
});
get('demo').addEventListener('click',async()=>{
  const token=++generation;worker?.terminate();worker=null;
  try {const response=await fetch('./samples/demo.txt');if(!response.ok)throw new Error('Cannot load the synthetic example.');const text=await response.text();if(token!==generation)return;get('date-order').value='DMY';run(text,'Synthetic demonstration · fictional participants and generated messages',token);}
  catch(error){showError(error.message);}
});
for(const id of ['participant','start','end','names'])get(id).addEventListener('change',render);
get('download').addEventListener('click',()=>downloadCsv('chat-aggregate-aliases.csv',['participant_alias','messages','words','media_markers','emoji_graphemes'],exported));
get('reset').addEventListener('click',()=>{
  generation++;worker?.terminate();worker=null;analysis=null;exported=[];
  get('file').value='';get('explore').hidden=true;get('error').hidden=true;get('names').checked=false;
  for(const id of ['metrics','participants','months','hours','words','emojis','participant-table'])get(id).replaceChildren();
  get('status').textContent='Analysis cleared. No chat is stored by this application.';
});
