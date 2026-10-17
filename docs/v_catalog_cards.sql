-- v_catalog_cards: the catalog as the app reads it, one row per wine vintage (data.js loadCards). Kept here for the record (2026-10-17);
-- it is changed by hand in Supabase (docs/catalog_speed.sql made this version). Region and country come from public.catalog_place_lines(), read once
-- per query. The view keeps security_invoker, so each visitor only sees what they may (players: published wines).
create view public.v_catalog_cards with (security_invoker = true) as   -- swapped in by docs/catalog_speed.sql (drop and create in one transaction)
 SELECT wv.id AS wine_vintage_id,
    wv.vintage_year,
    wv.is_non_vintage,
    p.name AS producer,
    w.name AS wine_name,
    w.style,
    a.name AS appellation,
    a.classification,
    gl.region,
    gl.country,
    COALESCE(( SELECT array_agg(g.name ORDER BY wg."position", g.name) AS array_agg
           FROM wine_grapes wg
             JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_id = w.id AND wg.basis = 'label'::basis_kind), '{}'::text[]) AS label_grapes,
    COALESCE(( SELECT array_agg(g.name ORDER BY wg."position", g.name) AS array_agg
           FROM wine_grapes wg
             JOIN grapes g ON g.id = wg.grape_id
          WHERE wg.wine_id = w.id AND (wg.basis = ANY (ARRAY['rule'::basis_kind, 'editor'::basis_kind]))), '{}'::text[]) AS rule_grapes,
    w.status::text AS wine_status,
    w.reach,
    wv.archived_at,
    img.storage_path AS image_path,
    img.kind AS image_kind,
    img.note AS image_note,
    w.vineyard,
    w.dosage
   FROM wine_vintages wv
     JOIN wines w ON w.id = wv.wine_id
     JOIN producers p ON p.id = w.producer_id
     LEFT JOIN geo_areas a ON a.id = w.appellation_id
     LEFT JOIN public.catalog_place_lines() gl(id, region, country) ON gl.id = w.appellation_id
     LEFT JOIN LATERAL ( SELECT wi.storage_path,
            wi.kind::text AS kind,
            wi.license_note AS note
           FROM wine_images wi
          WHERE wi.wine_id = w.id AND (wi.wine_vintage_id = wv.id OR wi.wine_vintage_id IS NULL) AND wi.status = 'verified'::verification_status
          ORDER BY (wi.wine_vintage_id IS NOT NULL) DESC, wi.is_primary DESC, wi.created_at DESC
         LIMIT 1) img ON true;
