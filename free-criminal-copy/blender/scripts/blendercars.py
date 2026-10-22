import sys,re
p='/Users/larsleslie/Library/Mobile Documents/com~apple~CloudDocs/untitled folder 2/free-criminal-copy/index.html'
s=open(p).read();n=0
def rep(a,b,cnt=1):
    global s,n
    if s.count(a)!=cnt: print('MISS',cnt,s.count(a),a[:90]);sys.exit(1)
    s=s.replace(a,b);n+=1

# each car type knows its own key (the model file is named after it)
rep("for(const k in CT){CT[k].wb=CT[k].l*0.6;CT[k].r2=Math.max(16,(CT[k].l/2+1.4)**2);}",
    "for(const k in CT){CT[k].key=k;CT[k].wb=CT[k].l*0.6;CT[k].r2=Math.max(16,(CT[k].l/2+1.4)**2);}")

# the model loader and the model-based car builder, just before the old builder
rep("function makeCarModel(t,color,city){if(t.bus)return makeBus(t,color);",
r"""/* 2.2: the cars are modelled in Blender and shipped as models/<car>.fcm (positions, normals, colours, indices). The model's paint
   is a marker colour the game swaps for each car's own colour; the glass, the close-up details, the lamp lenses (lit at night)
   and the livery panels are separate parts. One wheel model is shared by every car, scaled to its tyre. Missing models fall
   back to the old code-built cars. */
const MODELS={},MODEL_NAMES=['sedan','police','wheel'];
function parseFCM(buf){const dv=new DataView(buf);if(dv.getUint32(0,true)!==0x314D4346)throw new Error('not a model');const hl=dv.getUint32(4,true),hdr=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,8,hl))),base=8+hl,out={};
  for(const k in hdr.parts){const p=hdr.parts[k],n=p.v,pos=new Float32Array(buf.slice(base+p.po,base+p.po+n*12)),ni=new Int8Array(buf,base+p.no,n*3),ci=new Uint8Array(buf,base+p.co,n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3),paint=[];
    for(let i=0;i<n*3;i++){nor[i]=ni[i]/127;col[i]=ci[i]/255;}
    for(let i=0;i<n;i++)if(ci[i*3]===255&&ci[i*3+1]===0&&ci[i*3+2]===255)paint.push(i);
    const idx=p.i32?new Uint32Array(buf.slice(base+p.io,base+p.io+p.i*4)):new Uint16Array(buf.slice(base+p.io,base+p.io+p.i*2)),g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    if(p.uo!==undefined)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(buf.slice(base+p.uo,base+p.uo+n*8)),2));
    g.setIndex(new THREE.BufferAttribute(idx,1));g.computeBoundingSphere();g.userData.paint=paint;out[k]=g;}
  return out;}
async function loadModels(){await Promise.all(MODEL_NAMES.map(async k=>{try{const r=await fetch('models/'+k+'.fcm?v='+VERSION,{cache:'force-cache'});if(!r.ok)return;MODELS[k]=parseFCM(await r.arrayBuffer());}catch(e){console.warn('car model '+k,e);}}));}
function paintGeo(geo,color){const c=geo.clone(),a=c.attributes.color.array;_c.set(color);for(const i of geo.userData.paint){a[i*3]=_c.r;a[i*3+1]=_c.g;a[i*3+2]=_c.b;}return c;}
const WHEELM={};
function wheelM(r,side){const k=r+'|'+side;if(WHEELM[k])return WHEELM[k];const g=MODELS.wheel.wheel.clone();g.scale(side,r,r);
  if(side<0){const ix=g.index.array;for(let i=0;i<ix.length;i+=3){const t=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=t;}}   // the left wheels are mirrored, so their faces are turned back round
  return WHEELM[k]=g;}
const CARLAMP_MAT=new THREE.MeshBasicMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
function makeCarModelM(t,color,city,MD){
  if(!CARGLASS_MAT)CARGLASS_MAT=lit(new THREE.MeshPhongMaterial({color:0x070b0f,specular:0xb8c2cc,shininess:120,envMap:ENV,combine:THREE.MixOperation,reflectivity:0.18,transparent:true,opacity:0.93}));
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);const S=carShape(t),w=t.w,yb=S.yb,roofY=S.roofY,rz=S.zRoof,sporty=S.st===CSTY.fast||S.st===CSTY.super||S.st===CSTY.muscle;
  const bg=paintGeo(MD.body,color),bodyMesh=new THREE.Mesh(bg,CAR_MAT);bodyMesh.castShadow=true;bodyMesh.receiveShadow=true;body.add(bodyMesh);
  const dgeo=paintGeo(MD.det,color),detail=new THREE.Mesh(dgeo,CAR_MAT);body.add(detail);
  const glass=new THREE.Mesh(MD.glass,CARGLASS_MAT);body.add(glass);
  const lamp=new THREE.Mesh(MD.lamp,CAR_MAT);body.add(lamp);
  const night=new THREE.Mesh(MD.lamp,CARLAMP_MAT);night.visible=false;body.add(night);
  const look=t.police?copLook():randLook();
  const dsc=Math.min(1,(roofY-yb+0.12)/0.795),dg=merge([B(0.42,0.45,0.26,look.shirt,0,0.225,0),B(0.24,0.27,0.25,look.skin,0,0.595,0),B(0.26,0.08,0.27,look.hair,0,0.755,0)]);
  dg.scale(dsc,dsc,dsc);dg.translate(0.4,yb-0.2,t.cz-0.15);
  const driverMesh=new THREE.Mesh(dg,HMAT);driverMesh.visible=false;body.add(driverMesh);
  let lights=null,extra=null;
  if(t.police){const r=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.075,0.22),RED_OFF),b=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.075,0.22),BLUE_OFF);r.position.set(0.36,roofY+0.1,rz);b.position.set(-0.36,roofY+0.1,rz);body.add(r,b);lights=[r,b];}
  if(t.taxi){extra=merge([B(0.25,0.3,1.04,'#f2f2ee',0,roofY+0.2,rz),B(0.16,0.06,0.6,'#1d1e20',0,roofY+0.03,rz)]);body.add(new THREE.Mesh(extra,CAR_MAT));}
  let livery=null;
  if(t.police||t.taxi){const kind=t.police?'police':'taxi',cn=city||'San Varro';livery=new THREE.Group();body.add(livery);
    for(const sd of[1,-1])livery.add(new THREE.Mesh(MD[sd>0?'decalR':'decalL'],liveryMat(kind,cn,sd,t,S)));
    if(t.taxi){if(!LIVG.top){LIVG.top=new THREE.PlaneGeometry(0.98,0.26);}for(const sd of[1,-1]){const m=new THREE.Mesh(LIVG.top,topperMat(cn));m.rotation.y=sd*Math.PI/2;m.position.set(sd*0.128,roofY+0.2,rz);livery.add(m);}}}
  const wheels=[],wg={near:wheelM(t.wr,1),nearL:wheelM(t.wr,-1),blur:wheelGeoBlur(t.wr),far:wheelGeoFar(t.wr)},cg=calGeo(sporty||t.police?'#b3141b':'#3b3e42');
  for(const[sx,sz]of[[1,1],[-1,1],[1,-1],[-1,-1]]){const piv=new THREE.Group();piv.position.set(sx*(t.w/2-0.16),t.wr,sz*t.l*0.32);const wm=new THREE.Mesh(sx>0?wg.near:wg.nearL,CAR_MAT);wm.castShadow=true;piv.add(wm);
    const cal=new THREE.Mesh(cg,CAR_MAT);cal.position.set(sx*0.098,t.wr*0.28,-t.wr*0.28);cal.rotation.x=0.8;piv.add(cal);g.add(piv);wheels.push({piv,w:wm,cal,front:sz>0,side:sx});}
  const wgx=B(w*0.4,0.035,0.03,'#121212',w*0.2,0,0),wiper=new THREE.Mesh(wgx,HMAT);wiper.position.set(-w*0.28,yb+0.04,S.gh[0][0]-0.05);wiper.visible=false;body.add(wiper);
  return {group:g,body,bodyMesh,detail,glass,lamp,driverMesh,lights,wheels,wg,night,wiper,livery,geos:extra?[bg,dgeo,dg,wgx,extra]:[bg,dgeo,dg,wgx],top:yb,roofY,t,dsc};
}
function makeCarModel(t,color,city){if(t.bus)return makeBus(t,color);
  {const MD=MODELS[t.taxi?'sedan':t.key];if(MD&&MODELS.wheel)return makeCarModelM(t,color,city,MD);}""")

# the left wheels use the mirrored wheel
rep("const gg=!near?c.m.wg.far:fast?c.m.wg.blur:c.m.wg.near;","const gg=!near?c.m.wg.far:fast?c.m.wg.blur:(w.side<0&&c.m.wg.nearL)||c.m.wg.near;")

# wrecks: the comment had swallowed the rest of the line, so wrecked cars never went black; the lenses and details burn too
rep("c.hp=0;if(c.owned)c.persist=false;// 2.0: a wrecked garage car is cleared away like any wreck; Deliver brings a new onec.m.bodyMesh.material=BURNT_MAT;c.m.glass.visible=false;",
    "c.hp=0;if(c.owned)c.persist=false;/* 2.0: a wrecked garage car is cleared away like any wreck; Deliver brings a new one */c.m.bodyMesh.material=BURNT_MAT;if(c.m.detail)c.m.detail.material=BURNT_MAT;if(c.m.lamp)c.m.lamp.material=BURNT_MAT;c.m.glass.visible=false;")

# load the models before the city is built
rep("  try{buildWorld();createPlayer();}catch(err){","  $('loadTxt').textContent='Loading the cars…';await loadModels();$('loadTxt').textContent='Building San Varro…';\n  try{buildWorld();createPlayer();}catch(err){")

open(p,'w').write(s);print('patched',n)
