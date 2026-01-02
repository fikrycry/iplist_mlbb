import itertools
p='IP2LOCATION-LITE-DB3.CIDR.CSV'
with open(p,'r',encoding='utf-8',errors='replace') as f:
    for i,line in enumerate(itertools.islice(f,10),1):
        print(i, line.rstrip()[:400])
