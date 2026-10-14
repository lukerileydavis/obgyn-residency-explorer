for r in 334 152 53; do
  curl -sS -o details/$r.html -w "$r status=%{http_code} size=%{size_download}\n" "https://tools.apgo.org/residency-directory/search-residency-directory/residency-details/?rid=$r"
  sleep 15
done
