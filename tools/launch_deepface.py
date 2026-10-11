"""Compatibility entry for official DeepFaceLive on isolated Python 3.10."""
import collections
import collections.abc
import runpy
import sys
from pathlib import Path

for name in ('Iterable','Mapping','MutableMapping','Sequence'):
    if not hasattr(collections,name):
        setattr(collections,name,getattr(collections.abc,name))
root=Path(__file__).resolve().parents[1]
source=root/'.local/DeepFaceLive'
sys.path.insert(0,str(source))
sys.argv=[str(source/'main.py'),'run','DeepFaceLive','--userdata-dir',str(root/'.local/dfl-userdata'),'--no-cuda']
runpy.run_path(str(source/'main.py'),run_name='__main__')
