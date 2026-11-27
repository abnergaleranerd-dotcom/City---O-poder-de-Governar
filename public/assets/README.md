# Recursos 3D e Texturas — City Tycoon 4D

Esta pasta organiza os recursos locais (GLB/GLTF, texturas PBR e HDRIs) para o pipeline de carregamento assíncrono em `src/engine/assetLoader.ts`.

## Estrutura de Diretórios

- `models/buildings/` — Edificações brasileiras em `.glb` (ex.: `casa_popular.glb`, `predio_residencial.glb`, `hospital.glb`)
- `models/vehicles/` — Frota urbana em `.glb` (carros, ônibus, caminhões, ambulâncias, viaturas)
- `models/characters/` — Cidadãos com esqueletos e animações compartilhadas (`walk`, `idle`, `talk`, `work`, `protest`)
- `models/vegetation/` — Espécies tropicais, palmeiras, arbustos e gramíneas
- `models/urban/` — Mobiliário urbano (semáforos, postes, pontos de ônibus, placas)
- `textures/` — Mapas PBR otimizados (Albedo, Normal, Roughness, AO, Metalness; suporte a KTX2/Basis)
- `environment/` — Mapas HDRI equiretangulares `.hdr` para IBL e céu

## Licenças Recomendadas

Utilize apenas ativos devidamente licenciados (CC0 ou CC-BY com atribuição):
- **Poly Haven** (CC0 — texturas PBR e HDRIs)
- **Kenney** (CC0 — mobiliário urbano e veículos leves)
- **Quaternius** (CC0 — personagens animados, árvores e edificações modulares)
- **Sketchfab** (somente modelos com licença compatível verificada)

## Fallback Procedural

Enquanto um ativo específico não estiver registrado em `LOCAL_ASSET_MANIFEST` (`src/engine/assetLoader.ts`), o motor gráfico utiliza automaticamente modelos PBR procedurais multi-parte e texturas PBR geradas em memória (sem requisições 404).
