# Cèpes Lacanau

Indice de poussée des champignons (cèpes, girolle, chanterelle en tube, lactaire délicieux) sur les parcelles de la BD Forêt V2 de l'IGN, croisé avec la météo Open-Meteo et l'humidité locale (distance aux lacs et marais, BD TOPO).

## Variables d'environnement (Vercel)
- `APP_PASSWORD` : mot de passe d'accès à l'app.
- Base Upstash Redis (intégration Vercel Marketplace) : `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Sans base : espèces par défaut, carnet désactivé.

## Données
- Parcelles : WFS Géoplateforme `LANDCOVER.FORESTINVENTORY.V2:formation_vegetale`, tuiles de 0,03°.
- Eau : `BDTOPO_V3:surface_hydrographique`.
- Fonds : WMTS Plan IGN v2 et orthophotos.
- Météo : Open-Meteo, maille 0,1°, 30 jours passés + 10 jours de prévisions.
