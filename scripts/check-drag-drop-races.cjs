// Targeted regression checks against the installed, patched library source.
// Exercises the actual reset/style callbacks; this is not a visual device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const base = 'node_modules/react-native-draggable-flatlist/src/components/';
const list = fs.readFileSync(base + 'DraggableFlatList.tsx', 'utf8');
const start = list.indexOf('  const dataKeys =');
assert(start >= 0, 'Expected commit-scoped data reset patch');
const end = list.indexOf('\n  useEffect(', start);
const evaluateReset = new Function('props', 'keyExtractor', 'useRef', 'useLayoutEffect',
  'globalThis', 'setTimeout', 'reset', 'activeKey', 'dropHandoffActive', 'scheduleDropHandoffDetach',
  list.slice(start, end) + '\nreturn activeKey;');
let ref, effects, idle = [], resets = 0, active = null;
function commit(keys) {
  effects = [];
  let rendered = evaluateReset({data: keys}, x => x,
    initial => ref ?? (ref = {current: initial}),
    callback => effects.push(callback),
    {requestIdleCallback: callback => idle.push(callback)},
    callback => idle.push(callback),
    () => { resets++; active = null; }, active, false, () => {});
  effects.forEach(callback => callback());
  return rendered;
}
commit(['a','b','c']);
assert.equal(resets, 0);
for (let i=0; i<1000; i++) {
  active = 'a';
  const order = i % 2 ? ['a','b','c'] : ['c','b','a'];
  assert.equal(commit(order), null, 'New order must render without an active key');
  assert.equal(active, null, 'Reset must finish in the commit');
  active = 'next-drag';
  idle.splice(0).forEach(callback => callback());
  assert.equal(active, 'next-drag', 'An old reset must not cancel the next drag');
}
assert.equal(resets, 1000);
assert.equal(idle.length, 0);
// Different key arrays that collided with the old join("") comparison.
commit(['ab','c']); const previous = resets; commit(['a','bc']);
assert.equal(resets, previous + 1);
const cell = fs.readFileSync(base + 'CellRendererComponent.tsx', 'utf8');
let styleCallback;
traverse(parser.parse(cell,{sourceType:'module',plugins:['typescript','jsx']}), {
  VariableDeclarator(path) {
    if (path.node.id.name === 'animStyle') styleCallback = path.node.init.arguments[0];
  }
});
assert(styleCallback, 'Cell animated style not found');
const evaluateStyle = new Function('translate','isWeb','heldTanslate','activeKey','horizontalAnim',
  'return (' + cell.slice(styleCallback.start,styleCallback.end) + ')();');
const held = {value: 72};
evaluateStyle({value:72},false,held,'dragging',{value:false});
held.value = 0; // New layout/index commit clears the retained translation.
evaluateStyle({value:0},false,held,'dragging',{value:false});
assert.equal(held.value,0,'Returning to the original slot must retain zero, not an earlier offset');
const dropped = evaluateStyle({value:72},false,held,null,{value:false});
assert.equal(held.value,0,'A late mapper with an old translation must not restore it after drop');
assert.deepEqual(dropped.transform,[{translateY:0}]);
console.log('PASS: 1,000 consecutive reorder commits, key collision, stale post-drop mapper');

const appList = fs.readFileSync('components/tasks/task-swipe-draggable-list.tsx','utf8');
const claimStart = appList.indexOf('      if (completedDragGenerationRef.current ===');
const claimEnd = appList.indexOf('      traceDrag(diagnosticListId, "end",',claimStart);
assert(claimStart > 0 && claimEnd > claimStart);
const claim = new Function('completedDragGenerationRef','dragGenerationRef','traceDrag',
  'diagnosticListId','from','to', appList.slice(claimStart,claimEnd) + '\nreturn true;');
const completed = {current:0}, generation = {current:1};
let commits=0;
if(claim(completed,generation,()=>{},'test',3,1)) commits++;
if(claim(completed,generation,()=>{},'test',3,2)) commits++;
assert.equal(commits,1,'Duplicate end must never apply a second stale reorder');
generation.current++;
assert.equal(claim(completed,generation,()=>{},'test',1,3),true);
console.log('PASS: duplicate drag-end is ignored; next drag still commits');

let springCallback;
traverse(parser.parse(list,{sourceType:'module',plugins:['typescript','jsx']}), {
  CallExpression(path) {
    if(path.node.callee.name === 'withSpring') springCallback = path.node.arguments[2];
  }
});
assert(springCallback,'Drop spring callback not found');
let drops=[]; const disabled={value:true};
const callback = new Function('runOnJS','onDragEnd','from','to','disabled',
  'epoch', 'return (' + list.slice(springCallback.start,springCallback.end) + ');')
  (fn=>fn, event=>drops.push(event),3,1,disabled,7);
callback(false);
assert.equal(drops.length,0,'Cancelled spring must not report a successful drop');
assert.equal(disabled.value,false,'Cancellation must unlock the gesture');
callback(true);
assert.deepEqual(drops,[{from:3,to:1,epoch:7}]);
console.log('PASS: cancelled spring does not emit drag-end or leave gestures locked');

const epochStart = list.indexOf('      if (epoch !== dragEpoch.value');
const epochEnd = list.indexOf('      const { onDragEnd, data }',epochStart);
assert(epochStart > 0 && epochEnd > epochStart);
const claimEpoch = new Function('epoch','dragEpoch','completedDragEpochRef',
  list.slice(epochStart,epochEnd) + '\nreturn true;');
const epoch = {value:2}, completedEpoch = {current:0};
assert.equal(claimEpoch(1,epoch,completedEpoch),undefined,'Old callback must not touch the next drag');
assert.equal(claimEpoch(2,epoch,completedEpoch),true);
assert.equal(claimEpoch(2,epoch,completedEpoch),undefined,'Library must ignore duplicate completion');
console.log('PASS: old and duplicate library callbacks cannot clear a newer drag');

let indexCommitCallback;
traverse(parser.parse(cell,{sourceType:'module',plugins:['typescript','jsx']}), {
  CallExpression(path) {
    if(path.node.callee.name === 'useLayoutEffect' &&
       cell.slice(path.node.start,path.node.end).includes('lastIndexRef')) {
      indexCommitCallback=path.node.arguments[0];
    }
  }
});
assert(indexCommitCallback,'Index layout effect not found');
const lastIndex={current:0}, nativeWrites=[]; let syncCalls=0;
held.value=80;
const commitIndex = new Function('lastIndexRef','index','isWeb','runOnUISync',
  'heldTanslate','setNativeProps','viewRef','horizontalAnim','handoffMode',
  'return ('+cell.slice(indexCommitCallback.start,indexCommitCallback.end)+');')
  (lastIndex,1,false,fn=>{syncCalls++;fn();},held,
   (_ref,style)=>nativeWrites.push(style),{}, {value:false}, false);
commitIndex();
assert.equal(held.value,0);
assert.equal(syncCalls,1);
assert.deepEqual(nativeWrites,[{transform:[{translateY:0}]}]);
held.value=10;
commitIndex();
assert.equal(held.value,10,'An unchanged index must not reset a new drag');
console.log('PASS: index commit synchronously clears retained and native transforms once');

// Drop handoff transition: holds old position + old offset in the mount frame,
// then moves position and offset together; disarmed cells jump immediately.
let handoffFactory;
traverse(parser.parse(cell,{sourceType:'module',plugins:['typescript','jsx']}), {
  VariableDeclarator(path) {
    if (path.node.id.name === 'dropHandoffTransition') handoffFactory = path.node.init.arguments[0];
  }
});
assert(handoffFactory, 'Drop handoff transition not found');
const handoffSource = cell.slice(handoffFactory.start, handoffFactory.end)
  .replace('<LayoutAnimationFunction>', '').replace(/\(to: number\)/g, '(to)');
const timing = (to, cfg) => ({kind:'timing', to, duration: cfg.duration});
const delay = (ms, a) => ({kind:'delay', ms, a});
const sequence = (...a) => ({kind:'sequence', a});
const finalOf = a => a.kind === 'timing' ? a.to : a.kind === 'delay' ? finalOf(a.a) : finalOf(a.a[a.a.length-1]);
const firstStepOf = a => a.kind === 'sequence' ? firstStepOf(a.a[0]) : a;
const makeTransition = (heldValue, armed) => {
  const heldSv = {value: heldValue}, armedSv = {value: armed};
  const fn = new Function('heldTanslate','handoffArmed','horizontalAnim','withTiming','withDelay',
    'withSequence','DROP_HANDOFF_HOLD_MS','return ('+handoffSource+')();')
    (heldSv, armedSv, {value:false}, timing, delay, sequence, 150);
  return {fn, heldSv, armedSv};
};
const values = {currentOriginX:0,currentOriginY:60,currentWidth:300,currentHeight:54,
  targetOriginX:0,targetOriginY:0,targetWidth:300,targetHeight:54};
{
  const {fn, heldSv, armedSv} = makeTransition(-60, true);
  const r = fn(values);
  assert.equal(r.initialValues.originY, 60, 'Mount frame keeps the old position');
  assert.deepEqual(r.initialValues.transform, [{translateY:-60}], 'Mount frame keeps the old offset');
  assert.equal(finalOf(r.animations.originY), 0);
  assert.equal(finalOf(r.animations.transform[0].translateY), 0);
  const a = firstStepOf(r.animations.originY), b = firstStepOf(r.animations.transform[0].translateY);
  assert.equal(a.kind, 'delay'); assert.deepEqual(a, {...b, a: {...b.a, to: a.a.to}},
    'Position and offset must change on the same step');
  assert.equal(heldSv.value, 0, 'Retained offset is cleared for the animated style');
  assert.equal(armedSv.value, false, 'Handoff is consumed once');
  assert.equal(fn(values).initialValues.originY, 0, 'A second layout change jumps directly');
}
{
  const {fn, heldSv} = makeTransition(-60, false);
  const r = fn(values);
  assert.equal(r.initialValues.originY, 0, 'Layout changes during a drag are not held');
  assert.deepEqual(r.initialValues.transform, [{translateY:-60}], 'Immediate jump keeps the live offset');
  assert.equal(finalOf(r.animations.transform[0].translateY), -60);
  assert.equal(heldSv.value, -60, 'A running drag keeps its offset');
}
{
  // Reanimated merges a new transition into a running one ({...prev, ...next}).
  // Every key of the held handoff must be replaced, or a used animation object
  // is restarted inside the mount (crash: completed row dropped into today).
  const paths = (o, p = []) => o && typeof o === 'object' && !o.kind
    ? Object.keys(o).flatMap(k => paths(o[k], p.concat(k))) : [p.join('.')];
  const held = makeTransition(-60, true).fn(values);
  const again = makeTransition(0, false).fn(values);
  assert.deepEqual(paths(again.animations).sort(), paths(held.animations).sort(),
    'Both branches must animate the same keys');
  assert.deepEqual(paths(again.initialValues).sort(), paths(held.initialValues).sort());
}
console.log('PASS: drop handoff moves position and offset in one step, only once, same keys in both branches');
