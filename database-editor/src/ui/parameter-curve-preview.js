// Read-only, declarative numeric previews. No source evaluation or data writes.
export function sampleGodotCurve(text, ratio) {
  const data = text.match(/_data\s*=\s*\[([\s\S]*?)\]/)?.[1];
  if (!data) throw new Error('资源不是可读取的 Godot Curve');
  const points = [...data.matchAll(/Vector2\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*\)\s*,\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)\s*,\s*(\d+)\s*,\s*(\d+)/g)]
    .map(m => ({ x:+m[1], y:+m[2], left:+m[3], right:+m[4], lm:+m[5], rm:+m[6] }));
  if (!points.length) throw new Error('Curve 没有可读取的控制点');
  if (ratio <= points[0].x) return points[0].y;
  const bIndex = points.findIndex(p => p.x >= ratio);
  if (bIndex < 0) return points.at(-1).y;
  const a = points[bIndex-1], b = points[bIndex], dx = b.x-a.x;
  const t = (ratio-a.x)/dx, slope = (b.y-a.y)/dx;
  const m0 = (a.rm === 1 ? slope : a.right)*dx, m1 = (b.lm === 1 ? slope : b.left)*dx;
  return (2*t**3-3*t*t+1)*a.y + (t**3-2*t*t+t)*m0 + (-2*t**3+3*t*t)*b.y + (t**3-t*t)*m1;
}

export function sampleNumericPreview(spec, payload, mass, curveText = '') {
  const min = Math.min(spec.inputMaximum-1, Math.max(1, Number(payload[spec.inputMinimumField])));
  if (!Number.isFinite(min) || !Number.isFinite(mass)) throw new Error('重量数据无效');
  const ratio = Math.max(0, Math.min(1, (mass-min)/(spec.inputMaximum-min)));
  const multiplier = spec.kind === 'godotCurve' ? sampleGodotCurve(curveText, ratio)
    : spec.kind === 'power' ? 1 + 9 * ratio ** spec.exponent : NaN;
  const base = spec.valueField ? Number(payload[spec.valueField]) : 1;
  if (!Number.isFinite(multiplier) || !Number.isFinite(base)) throw new Error('曲线配置无效');
  return multiplier * base;
}

export async function readPreviewResource(root, path) {
  if (!root || !/^res:\/\//.test(path)) throw new Error('请先打开项目目录');
  const parts = path.slice(6).split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) throw new Error('资源路径无效');
  let directory = root;
  for (const part of parts.slice(0,-1)) directory = await directory.getDirectoryHandle(part);
  return (await (await directory.getFileHandle(parts.at(-1))).getFile()).text();
}

export function resolvePreviewCurvePath(spec, templates) {
  const table = templates.find(t => t.name === spec.resourceTemplate);
  const row = table?.instances?.find(i => i.payload?.[spec.resourceMatchField] === spec.resourceMatchValue);
  const path = row?.payload?.[spec.resourcePathField];
  if (!path) throw new Error('关联的曲线资源未找到');
  return path;
}

let renderVersion = 0;
export async function renderParameterCurvePreviews(list, template, instanceIndex, root, templates = []) {
  const version = ++renderVersion;
  list.querySelectorAll('[data-numeric-preview]').forEach(n => n.remove());
  list._refreshNumericPreviews = null;
  const specs = template?.parameters?.filter(p => p.curvePreview).map(p => p.curvePreview) || [];
  const payload = template?.instances?.[instanceIndex]?.payload;
  if (!specs.length || !payload) return;
  if (!list.dataset.numericPreviewListener) {
    list.dataset.numericPreviewListener = 'true';
    list.addEventListener('input', event => {
      if (!event.target.closest('[data-numeric-preview]')) list._refreshNumericPreviews?.();
    });
  }
  list._refreshNumericPreviews = () => renderParameterCurvePreviews(list, template, instanceIndex, root, templates);
  const block = document.createElement('li'); block.dataset.numericPreview = 'true';
  block.style.cssText = 'display:block;padding:12px;background:#102332;color:#e1f0fa;border:1px solid #446579;border-radius:6px';
  const heading = document.createElement('strong'); heading.textContent = '重量影响曲线（只读预览）'; block.appendChild(heading);
  const control = document.createElement('label'); control.style.cssText='display:block;margin:10px 0';
  control.textContent='预览整机重量 / kg（非运行时重量） ';
  const input = document.createElement('input'); input.type='number'; input.min='0'; input.max=String(specs[0].inputMaximum); input.step='100';
  input.value = String(Number(payload[specs[0].inputMinimumField])); input.style.width='110px'; control.appendChild(input); block.appendChild(control);
  list.prepend(block);
  for (const spec of specs) {
    const section = document.createElement('section'); block.appendChild(section);
    try {
      const path = spec.kind === 'godotCurve' ? resolvePreviewCurvePath(spec, templates) : '';
      const curveText = path ? await readPreviewResource(root, path) : '';
      if (version !== renderVersion || !block.isConnected) return;
      const draw = () => {
        section.replaceChildren();
        const mass = Math.max(0, Number(input.value)), guarantee = Number(payload[spec.inputMinimumField]);
        const value = sampleNumericPreview(spec, payload, mass, curveText);
        const label = document.createElement('p'); label.textContent=`${spec.title}：${value.toFixed(3)} ${spec.unit} ｜ 保证重量 ${guarantee/1000} t`; section.appendChild(label);
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 400 180'); svg.setAttribute('role','img'); svg.setAttribute('aria-label',label.textContent); svg.style.width='100%';
        const max = Math.max(1, sampleNumericPreview(spec,payload,spec.inputMaximum,curveText));
        const point = kg => `${35+350*kg/spec.inputMaximum},${148-125*sampleNumericPreview(spec,payload,kg,curveText)/max}`;
        const add = (tag,attrs,text) => { const n=document.createElementNS(svg.namespaceURI,tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v)); if(text)n.textContent=text; svg.appendChild(n); };
        add('path',{d:'M35 15V148H385',fill:'none',stroke:'#88a4b6'});
        add('polyline',{points:Array.from({length:201},(_,i)=>point(i*spec.inputMaximum/200)).join(' '),fill:'none',stroke:'#4cccff','stroke-width':2});
        const gx=35+350*guarantee/spec.inputMaximum; add('line',{x1:gx,x2:gx,y1:15,y2:148,stroke:'#55f3a0'});
        const [cx,cy]=point(Math.min(spec.inputMaximum,mass)).split(','); add('line',{x1:cx,x2:cx,y1:15,y2:148,stroke:'#ffdf69'}); add('circle',{cx,cy,r:4,fill:'#ffdf69'});
        for(const [x,y,label] of [[35,170,'0 t'],[335,170,`${spec.inputMaximum/1000} t`],[1,20,max.toFixed(2)],[15,148,'0']]) add('text',{x,y,fill:'#d3e9f6','font-size':11},label);
        section.appendChild(svg);
        const legend=document.createElement('small'); legend.textContent='横轴：整机重量 ｜ 绿线：性能保证重量 ｜ 黄点：预览重量'+(mass>spec.inputMaximum?'（超过图表范围）':''); section.appendChild(legend);
      };
      draw(); input.addEventListener('input',draw);
    } catch(error) { section.textContent=`${spec.title}：${error.message}`; }
  }
}
