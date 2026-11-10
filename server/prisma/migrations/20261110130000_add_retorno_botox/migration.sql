-- Serviço "Retorno do Botox" (R$ 0,00, 30 min), que a clínica usava no app
-- antigo. Só cria onde ainda não existe — não mexe se já foi cadastrado no painel.
INSERT INTO "Service" ("id", "tenantId", "categoryId", "name", "slug", "durationMinutes", "priceCents", "imageUrl", "sortOrder")
SELECT 'retbotox' || substr(md5(c."tenantId"), 1, 17), c."tenantId", c."id", 'Retorno do Botox', 'retorno-botox', 30, 0,
       '/services/catalog/hf-botox.jpg',
       COALESCE((SELECT "sortOrder" + 1 FROM "Service" s WHERE s."tenantId" = c."tenantId" AND s."slug" = 'botox'), 0)
FROM "ServiceCategory" c
WHERE c."slug" = 'harmonizacao-facial'
  AND NOT EXISTS (SELECT 1 FROM "Service" s WHERE s."tenantId" = c."tenantId" AND (s."slug" = 'retorno-botox' OR lower(s."name") LIKE 'retorno d% botox'));
