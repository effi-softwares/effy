-- Product-level "Net Weight" and "Net Volume" attributes are removed.
--
-- Since 098 each variant carries its own pack quantity (500 g, 1.25 L — the net content unit pricing reads)
-- and its own weight (what the delivery fee reads). One net figure on the product cannot describe a product
-- sold in more than one size, so the two attributes, their product-type links and every value entered
-- against them go. Idempotent: a database that never had them changes nothing.

-- +goose Up
DELETE FROM public.product_attribute_value
 WHERE attribute_definition_id IN
       (SELECT id FROM public.attribute_definition WHERE key IN ('net_weight', 'net_volume'));

DELETE FROM public.product_type_attribute
 WHERE attribute_definition_id IN
       (SELECT id FROM public.attribute_definition WHERE key IN ('net_weight', 'net_volume'));

DELETE FROM public.attribute_definition WHERE key IN ('net_weight', 'net_volume');

-- +goose Down
-- The definitions and their product-type links come back; values entered against them do not.
INSERT INTO public.attribute_definition (id, key, name, data_type, unit, help_text, validation, status, created_at, updated_at) VALUES
    ('4a8597d9-fabc-4a5e-aa1a-e0f8a8788eb2', 'net_weight', 'Net Weight', 'number', 'g', 'Net weight in grams', NULL, 'active', now(), now()),
    ('68d05001-331c-4089-99f0-cadca5e3af69', 'net_volume', 'Net Volume', 'number', 'ml', 'Net volume in millilitres', NULL, 'active', now(), now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.product_type_attribute (id, product_type_id, attribute_definition_id, is_mandatory, display_order, group_label)
SELECT v.id::uuid, pt.id, d.id, true, 0, 'Physical'
  FROM (VALUES ('1ea6336b-e2ce-4200-82e9-f1af1bdaad78', 'packaged_grocery', 'net_weight'),
               ('c5f87286-e585-4dbf-aa37-b24fa9bdc7d0', 'beverage', 'net_volume')) AS v (id, type_key, attr_key)
  JOIN public.product_type pt ON pt.key = v.type_key
  JOIN public.attribute_definition d ON d.key = v.attr_key
ON CONFLICT (product_type_id, attribute_definition_id) DO NOTHING;
