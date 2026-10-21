// Vite публикует только готовые GeoJSON, без исходных снимков OSM.
export const researchGeometryUrls: Record<string, string> = {
  "sochi-01": new URL("../research/sochi-01.geojson", import.meta.url).href,
  "gelendzhik-01": new URL("../research/gelendzhik-01.geojson", import.meta.url)
    .href,
  "turkey-01": new URL("../research/turkey-01.geojson", import.meta.url).href,
  "anapa-01": new URL("../research/anapa-01.geojson", import.meta.url).href,
  "batumi-01": new URL("../research/batumi-01.geojson", import.meta.url).href,
  "burgas-01": new URL("../research/burgas-01.geojson", import.meta.url).href,
  "danube-01": new URL("../research/danube-01.geojson", import.meta.url).href,
  "odesa-01": new URL("../research/odesa-01.geojson", import.meta.url).href,
  "poti-rioni-01": new URL("../research/poti-rioni-01.geojson", import.meta.url)
    .href,
  "kobuleti-01": new URL("../research/kobuleti-01.geojson", import.meta.url)
    .href,
  "trabzon-rize-01": new URL(
    "../research/trabzon-rize-01.geojson",
    import.meta.url
  ).href,
  "giresun-01": new URL("../research/giresun-01.geojson", import.meta.url).href,
  "yesilirmak-01": new URL("../research/yesilirmak-01.geojson", import.meta.url)
    .href,
  "sinop-01": new URL("../research/sinop-01.geojson", import.meta.url).href,
  "sakarya-01": new URL("../research/sakarya-01.geojson", import.meta.url).href,
  "kilyos-01": new URL("../research/kilyos-01.geojson", import.meta.url).href,
  "igneada-01": new URL("../research/igneada-01.geojson", import.meta.url).href,
  "varna-kamchia-01": new URL(
    "../research/varna-kamchia-01.geojson",
    import.meta.url
  ).href,
  "shabla-kaliakra-01": new URL(
    "../research/shabla-kaliakra-01.geojson",
    import.meta.url
  ).href,
  "mamaia-01": new URL("../research/mamaia-01.geojson", import.meta.url).href,
  "tendra-01": new URL("../research/tendra-01.geojson", import.meta.url).href,
  "kalamita-01": new URL("../research/kalamita-01.geojson", import.meta.url)
    .href,
  "yalta-alushta-01": new URL(
    "../research/yalta-alushta-01.geojson",
    import.meta.url
  ).href,
  "feodosia-koktebel-01": new URL(
    "../research/feodosia-koktebel-01.geojson",
    import.meta.url
  ).href,
};
