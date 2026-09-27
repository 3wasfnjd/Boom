"""Extract reusable static Motri prefabs without changing their vertex data.
Usage: python3 scripts/extract-world-assets.py /path/to/Motri
"""
import copy, hashlib, json, pathlib, shutil, struct, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = pathlib.Path(sys.argv[1]) / 'static'
DEST = ROOT / 'models/world'
REVISION = 'ee7e01dfe848f1bc7e857d51bcee2e687bee21eb'
SPECS = [
 ('rest-house/rest-house.glb','motri-rest-house.glb',None),
 ('scenery/scenery.glb','motri-scenery.glb',['bridgePhysicalFixed','basaltRocksPhysicalStatic.001','basaltRocksPhysicalStatic.003']),
 ('fences/fences.glb','motri-fence.glb',['fencePhysicalDynamic.001']),
 ('bricks/bricks.glb','motri-brick.glb',['Cube.042']),
 ('poleLights/poleLights.glb','motri-lamp.glb',['poleLight.002']),
 ('oakTrees/oakTreesVisual.glb','motri-oak.glb',None),
]
def subset(source,names):
 blob=source.read_bytes();length=struct.unpack_from('<I',blob,12)[0]
 gltf=json.loads(blob[20:20+length]);binary=blob[28+length:]
 assert not gltf.get('animations') and not gltf.get('skins'), 'Static props only'
 roots=gltf['scenes'][gltf.get('scene',0)]['nodes']
 if names is None:return blob
 roots=[i for i in roots if gltf['nodes'][i].get('name') in names]
 assert len(roots)==len(names),(source,names)
 selected=set()
 def visit(i):
  selected.add(i)
  for c in gltf['nodes'][i].get('children',[]):visit(c)
 for i in roots:visit(i)
 def index_map(values):return {old:new for new,old in enumerate(sorted(values))}
 nodes=index_map(selected)
 meshes=index_map({gltf['nodes'][i]['mesh'] for i in nodes if 'mesh' in gltf['nodes'][i]})
 accessors=set();views=set()
 for i in meshes:
  for p in gltf['meshes'][i]['primitives']:
   accessors.update(p['attributes'].values())
   if 'indices' in p:accessors.add(p['indices'])
   d=p.get('extensions',{}).get('KHR_draco_mesh_compression')
   if d:views.add(d['bufferView'])
 for i in accessors:
  a=gltf['accessors'][i];assert not a.get('sparse')
  if 'bufferView' in a:views.add(a['bufferView'])
 for img in gltf.get('images',[]):
  if 'bufferView' in img:views.add(img['bufferView'])
 accessors=index_map(accessors);views=index_map(views)
 result=copy.deepcopy(gltf);result['scenes']=[{'nodes':[nodes[i] for i in roots]}];result['scene']=0
 result['nodes']=[]
 for old in nodes:
  n=copy.deepcopy(gltf['nodes'][old])
  if 'children' in n:n['children']=[nodes[i] for i in n['children']]
  if 'mesh' in n:n['mesh']=meshes[n['mesh']]
  result['nodes'].append(n)
 result['meshes']=[]
 for old in meshes:
  m=copy.deepcopy(gltf['meshes'][old])
  for p in m['primitives']:
   p['attributes']={k:accessors[v] for k,v in p['attributes'].items()}
   if 'indices' in p:p['indices']=accessors[p['indices']]
   d=p.get('extensions',{}).get('KHR_draco_mesh_compression')
   if d:d['bufferView']=views[d['bufferView']]
  result['meshes'].append(m)
 result['accessors']=[]
 for old in accessors:
  a=copy.deepcopy(gltf['accessors'][old])
  if 'bufferView' in a:a['bufferView']=views[a['bufferView']]
  result['accessors'].append(a)
 payload=bytearray();result['bufferViews']=[]
 for old in views:
  v=copy.deepcopy(gltf['bufferViews'][old]);payload.extend(b'\0'*(-len(payload)%4))
  start=v.get('byteOffset',0);chunk=binary[start:start+v['byteLength']];assert len(chunk)==v['byteLength']
  v['byteOffset']=len(payload);v['buffer']=0;payload.extend(chunk);result['bufferViews'].append(v)
 for img in result.get('images',[]):
  if 'bufferView' in img:img['bufferView']=views[img['bufferView']]
 payload.extend(b'\0'*(-len(payload)%4));result['buffers']=[{'byteLength':len(payload)}]
 text=json.dumps(result,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
 return struct.pack('<4sII',b'glTF',2,28+len(text)+len(payload))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(payload),b'BIN\0')+payload
DEST.mkdir(parents=True,exist_ok=True);manifest=[]
for original,name,selection in SPECS:
 source=SOURCE/original;data=subset(source,selection);(DEST/name).write_bytes(data)
 manifest.append({'source':original,'file':'models/world/'+name,'sourceBytes':source.stat().st_size,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'roots':selection or 'all'})
for original,name in [('rest-house/stone-paving.webp','motri-paving.webp'),('palette.png','motri-palette.png'),('terrain/terrain.png','motri-terrain.png'),('floor/slabs.png','motri-slabs.png')]:
 data=(SOURCE/original).read_bytes();(DEST/name).write_bytes(data)
 manifest.append({'source':original,'file':'models/world/'+name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
# Preserve the source terrain's actual 129 x 129 vertex heights in a compact grid.
blob=(SOURCE/'terrain/terrain.glb').read_bytes();length=struct.unpack_from('<I',blob,12)[0]
gltf=json.loads(blob[20:20+length]);binary=blob[28+length:]
accessor=gltf['accessors'][gltf['meshes'][0]['primitives'][0]['attributes']['POSITION']]
view=gltf['bufferViews'][accessor['bufferView']];offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
assert accessor['componentType']==5126 and accessor['count']==129*129
heights=[0.]*(129*129)
for i in range(accessor['count']):
 x,y,z=struct.unpack_from('<fff',binary,offset+i*view.get('byteStride',12))
 heights[round((z/192+.5)*128)*129+round((x/192+.5)*128)]=y
data=struct.pack('<'+'f'*len(heights),*heights);name='models/world/motri-heightfield.bin';(ROOT/name).write_bytes(data)
manifest.append({'source':'terrain/terrain.glb','file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'adaptation':'Unmodified vertex Y values, reordered into X/Z grid; float32 little-endian'})
name='src/motri/DunesField.js';(ROOT/name).parent.mkdir(exist_ok=True)
data=(SOURCE.parent/'sources/Game/World/DunesField.js').read_bytes();(ROOT/name).write_bytes(data)
manifest.append({'source':'sources/Game/World/DunesField.js','file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'adaptation':'Unmodified source; Boom samples and scales this dune field'})
(ROOT/'verification/world-assets.json').write_text(json.dumps({'repository':'3wasfnjd/Motri','revision':REVISION,'assets':manifest,'totalBytes':sum(a['bytes'] for a in manifest)},indent=2)+'\n')
for a in manifest:print(a['file'],a['bytes'])
