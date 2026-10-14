#!/bin/bash
# Crawl detail pages for rids in rids-gt230.txt that aren't cached yet.
# 2s between requests. First 403: wait 60s and retry that rid. Second 403 (total): stop.
cd /Users/lukedavis/Code/residency
n403=0
for r in $(cat rids-gt230.txt); do
  [ -s details/$r.html ] && continue
  while true; do
    code=$(curl -sS -o details/$r.html.tmp -w "%{http_code}" "https://tools.apgo.org/residency-directory/search-residency-directory/residency-details/?rid=$r")
    echo "$(date +%T) $r $code"
    if [ "$code" = "200" ]; then mv details/$r.html.tmp details/$r.html; break; fi
    rm -f details/$r.html.tmp
    if [ "$code" = "403" ]; then
      n403=$((n403+1))
      if [ $n403 -ge 2 ]; then echo "STOPPED: second 403 at rid $r"; exit 1; fi
      echo "403 at rid $r, waiting 60s then retrying"; sleep 60; continue
    fi
    echo "STOPPED: unexpected status $code at rid $r"; exit 1
  done
  sleep 2
done
echo DONE
