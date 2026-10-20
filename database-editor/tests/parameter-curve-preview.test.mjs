import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sampleGodotCurve, sampleNumericPreview, readPreviewResource, resolvePreviewCurvePath, renderParameterCurvePreviews } from '../src/ui/parameter-curve-preview.js';

const curve = '[resource]\n_data = [Vector2(0, 1), 0, 0, 1, 1, Vector2(0.5, 3.25), 0, 0, 1, 1, Vector2(1, 10), 0, 0, 1, 1]';
test('switching to a table without previews clears the previous refresh callback', async () => {
  const list={querySelectorAll:()=>[],_refreshNumericPreviews:()=>{throw new Error('stale preview');}};
  await renderParameterCurvePreviews(list,{parameters:[],instances:[]},0,null);
  assert.equal(list._refreshNumericPreviews,null);
});
test('Godot curve handles linear tangents, plateau and endpoints', () => {
  assert.equal(sampleGodotCurve(curve, -.1), 1);
  assert.equal(sampleGodotCurve(curve, .25), 2.125);
  assert.equal(sampleGodotCurve(curve, 2), 10);
  const spec={kind:'godotCurve',inputMinimumField:'guarantee',inputMaximum:150000,valueField:'interval'};
  const row={guarantee:65000,interval:.1};
  assert.equal(sampleNumericPreview(spec,row,65000,curve),.1);
  assert.equal(sampleNumericPreview(spec,row,0,curve),.1);
  assert.equal(sampleNumericPreview(spec,row,150000,curve),1);
  assert.equal(sampleNumericPreview({...spec,kind:'power',exponent:1.6,valueField:null},row,150000),10);
});
test('free tangents use cubic interpolation', () => {
  const free='_data = [Vector2(0, 0), 0, 0, 0, 0, Vector2(1, 1), 0, 0, 0, 0]';
  assert.equal(sampleGodotCurve(free,.25), .15625);
  assert.throws(()=>sampleGodotCurve('not a Curve',0),/Curve/);
});
test('resource lookup follows the associated data table; traversal is rejected', async () => {
  const templates=[{name:'formula',instances:[{payload:{id:'qb',path:'res://curve.tres'}}]}];
  const spec={resourceTemplate:'formula',resourceMatchField:'id',resourceMatchValue:'qb',resourcePathField:'path'};
  assert.equal(resolvePreviewCurvePath(spec,templates),'res://curve.tres');
  assert.throws(()=>resolvePreviewCurvePath(spec,[]),/未找到/);
  await assert.rejects(readPreviewResource({},'res://../secret'),/无效/);
  const root={getFileHandle:async name=>{assert.equal(name,'curve.tres');return {getFile:async()=>({text:async()=>curve})};}};
  assert.equal(await readPreviewResource(root,'res://curve.tres'),curve);
});
test('panels refresh installs a declarative preview hook on internal refresh calls', async () => {
  const source=await readFile(new URL('../src/ui/panels.js',import.meta.url),'utf8');
  const encoded=source.match(/const FACTORY_SOURCE = (".*");/)[1];
  const factory=JSON.parse(encoded);
  assert.equal(factory.split('updateParamNameInputValidity();\n  }').length-1,1);
  assert.match(source,/renderNumericPreviews: renderParameterCurvePreviews/);
});
