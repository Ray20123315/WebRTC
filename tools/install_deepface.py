"""Idempotent local install; invoke with an existing Python 3.10 interpreter."""
import hashlib,json,subprocess,sys,urllib.request,venv,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];LOCAL=ROOT/'.local'
COMMIT='fc7b787bda2b8c186e142c52857458eea3a935ed'
SOURCE_HASH='628c6e45ddaebf2954871d48c0943cf3dc42fb6ae0e34b70bce25cfc83afb279'
MODEL_HASH='b924d96ec5ce15ea984cb7466dbcfd2da71d80d234621422f54de2fd482385fa'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def download(url,path,expected):
 if path.exists():
  if sha(path)!=expected:raise RuntimeError(f'Existing file hash differs: {path.name}; retained for inspection')
  return
 partial=path.with_suffix(path.suffix+'.partial')
 if partial.exists():raise RuntimeError(f'Partial download retained: {partial.name}; inspect before retry')
 print('Downloading',path.name,flush=True)
 with urllib.request.urlopen(url,timeout=90) as r,partial.open('wb') as f:
  for chunk in iter(lambda:r.read(1024*1024),b''):f.write(chunk)
 if sha(partial)!=expected:raise RuntimeError('Download hash differs; partial retained')
 partial.replace(path)
def main():
 if sys.version_info[:2]!=(3,10):raise SystemExit('Use an existing Python 3.10 / Conda interpreter.')
 LOCAL.mkdir(exist_ok=True);source=LOCAL/'DeepFaceLive';archive=LOCAL/'DeepFaceLive-source.zip'
 download(f'https://codeload.github.com/iperov/DeepFaceLive/zip/{COMMIT}',archive,SOURCE_HASH)
 if not source.exists():
  staging=LOCAL/f'DeepFaceLive-{COMMIT}'
  if staging.exists():raise RuntimeError('Existing staging retained; inspect before resuming')
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    target=(LOCAL/name).resolve()
    if not target.is_relative_to(LOCAL.resolve()):raise RuntimeError('Archive path outside local workspace')
   z.extractall(LOCAL)
  staging.replace(source)
 environment=LOCAL/'dfl-env';python=environment/'Scripts/python.exe'
 if not python.exists():venv.EnvBuilder(with_pip=True).create(environment)
 subprocess.run([str(python),'-m','pip','install','-r',str(ROOT/'tools/deepface-requirements.lock.txt')],check=True)
 for path in source.rglob('*.py'):
  data=path.read_bytes();patched=data.replace(b'from collections import Iterable',b'from collections.abc import Iterable')
  if data!=patched:path.write_bytes(patched)
 slider=source/'apps/DeepFaceLive/ui/widgets/QSliderCSWNumber.py'
 data=slider.read_bytes();patched=data.replace(b'self._slider.setValue(value)',b'self._slider.setValue(int(round(value)))')
 if data!=patched:slider.write_bytes(patched)
 models=LOCAL/'dfl-userdata/dfm_models';models.mkdir(parents=True,exist_ok=True)
 download('https://github.com/iperov/DeepFaceLive/releases/download/ROB_DOE/Rob_Doe.dfm',models/'Rob_Doe.dfm',MODEL_HASH)
 subprocess.run([str(python),str(source/'main.py'),'dev','merge_large_files'],check=True)
 subprocess.run([str(python),'-m','pip','check'],check=True)
 (LOCAL/'deepface-install.json').write_text(json.dumps({'source_commit':COMMIT,'source_zip_sha256':SOURCE_HASH,'model_sha256':MODEL_HASH,'status':'installed; runtime validation required'},indent=2),encoding='utf-8')
 print('Installed; run DeepFaceLive and browser validation before claiming runtime success.')
if __name__=='__main__':main()
