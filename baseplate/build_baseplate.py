# Merge GLBs onto one flat baseplate -> single GLB. Usage: merge.py <uploads_dir> <out.glb>
import json,struct,sys,math,numpy as np
up,out=sys.argv[1],sys.argv[2]
def load(p):
    d=open(p,'rb').read(); o=12; ch={}
    while o<len(d):
        cl,ct=struct.unpack('<II',d[o:o+8]); ch[ct]=d[o+8:o+8+cl]; o+=8+cl
    return json.loads(ch[0x4E4F534A]), ch[0x004E4942]
def yaw(deg):
    r=math.radians(deg)/2; return [0,math.sin(r),0,math.cos(r)]
G={'asset':{'version':'2.0','generator':'baseplate merge'},'scene':0,'scenes':[{'name':'Baseplate','nodes':[]}],
   'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}]}
BIN=bytearray()
def pad():
    while len(BIN)%4: BIN.append(0)
def add(path,name,t,rot):
    g,b=load(f'{up}/{path}')
    pad(); boff=len(BIN); BIN.extend(b)
    bv0,ac0,me0,ma0,no0=(len(G[k]) for k in ('bufferViews','accessors','meshes','materials','nodes'))
    for v in g['bufferViews']: v=dict(v); v['byteOffset']=v.get('byteOffset',0)+boff; G['bufferViews'].append(v)
    for a in g['accessors']: a=dict(a); a['bufferView']+=bv0; G['accessors'].append(a)
    G['materials']+= [dict(m,name=f'{name}_{m["name"]}') for m in g['materials']]
    for m in g['meshes']:
        m=json.loads(json.dumps(m))
        for p in m['primitives']:
            p['attributes']={k:v+ac0 for k,v in p['attributes'].items()}; p['indices']+=ac0
            if 'material' in p: p['material']+=ma0
        G['meshes'].append(m)
    for n in g['nodes']:
        n=json.loads(json.dumps(n))
        if 'mesh' in n: n['mesh']+=me0
        if 'children' in n: n['children']=[c+no0 for c in n['children']]
        G['nodes'].append(n)
    roots=[r+no0 for r in g['scenes'][g.get('scene',0)]['nodes']]
    G['nodes'].append({'name':name,'translation':t,'rotation':rot,'children':roots})
    G['scenes'][0]['nodes'].append(len(G['nodes'])-1)
# Baseplate: 512 m x 512 m slab, 1 m thick, top face at y = 0. Plain grey, no UVs or textures.
S,T=256.0,1.0
c=np.array([[x,y,z] for x in(-S,S) for y in(-T,0) for z in(-S,S)],dtype='<f4')
# faces with outward winding (CCW seen from outside)
F=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(1,5,7,3),(0,2,6,4)]
# x-:(0,1,3,2) x+:(4,6,7,5) z-:(0,4,5,1) z+:(2,3,7,6) y+(top):(1,5,7,3) y-:(0,2,6,4)
V=[];N=[];I=[]
for f in F:
    q=c[list(f)]; n=np.cross(q[1]-q[0],q[2]-q[0]); n/=np.linalg.norm(n); k=len(V)
    V+=list(q); N+=[n]*4; I+=[k,k+1,k+2,k,k+2,k+3]
V=np.array(V,'<f4');N=np.array(N,'<f4');I=np.array(I,'<u2')
def blob(arr,target,acc):
    pad(); o=len(BIN); BIN.extend(arr.tobytes())
    G['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':arr.nbytes,'target':target})
    acc['bufferView']=len(G['bufferViews'])-1; G['accessors'].append(acc); return len(G['accessors'])-1
pa=blob(V,34962,{'componentType':5126,'count':len(V),'type':'VEC3','min':V.min(0).tolist(),'max':V.max(0).tolist()})
na=blob(N,34962,{'componentType':5126,'count':len(N),'type':'VEC3'})
ia=blob(I,34963,{'componentType':5123,'count':len(I),'type':'SCALAR'})
G['materials'].append({'name':'Baseplate','pbrMetallicRoughness':{'baseColorFactor':[0.62,0.63,0.64,1],'metallicFactor':0,'roughnessFactor':0.9}})
G['meshes'].append({'name':'Baseplate','primitives':[{'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':len(G['materials'])-1}]})
G['nodes'].append({'name':'Baseplate','mesh':len(G['meshes'])-1}); G['scenes'][0]['nodes'].append(len(G['nodes'])-1)
# Layout (metres, +Z forward, Y up). Each model's lowest point sits on y=0.
add('3974e547-bike_yeti.glb','Bike',[0,0,0],yaw(0))                    # min y 0.000
add('3b367e96-helmet_fullface.glb','Helmet',[0.95,0.1441,0.45],yaw(55)) # min y -0.1441 (chin bar)
add('df318d2e-goggles.glb','Goggles',[0.95,0.1441,0.45],yaw(55))       # same origin as helmet: worn on it
add('a0d53959-backpack.glb','Backpack',[0.95,-0.0150,-0.45],yaw(-90))  # min y 0.015; back panel faces +X
pad(); G['buffers'][0]['byteLength']=len(BIN)
J=json.dumps(G,separators=(',',':')).encode()
while len(J)%4: J+=b' '
total=12+8+len(J)+8+len(BIN)
with open(out,'wb') as f:
    f.write(struct.pack('<III',0x46546C67,2,total)); f.write(struct.pack('<II',len(J),0x4E4F534A)); f.write(J)
    f.write(struct.pack('<II',len(BIN),0x004E4942)); f.write(BIN)
print('wrote',out,total,'bytes')
