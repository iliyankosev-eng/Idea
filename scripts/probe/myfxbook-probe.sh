#!/usr/bin/env bash
# Probe: can Myfxbook public pages be read from GitHub Actions? Saves status, size and the HTML.
set -u
mkdir -p out && cd out
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
i=0
for url in \
  "https://www.myfxbook.com/systems" \
  "https://www.myfxbook.com/systems?type=1" \
  "https://www.myfxbook.com/members" \
  "https://www.myfxbook.com/api/get-community-outlook.json" \
  "https://www.myfxbook.com/help/verification"; do
  i=$((i+1))
  code=$(curl -sS -L --max-time 40 -A "$UA" -H "Accept-Language: en-US,en;q=0.9" -o "p$i.html" -w "%{http_code}" "$url" || echo ERR)
  echo "p$i $code $(wc -c < p$i.html 2>/dev/null || echo 0) $url | title: $(grep -o '<title>[^<]*' p$i.html 2>/dev/null | head -1)" >> LOG.txt
done
cat LOG.txt
