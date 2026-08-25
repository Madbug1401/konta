-- Categorias de sistema (userId NULL = partilhadas por todos os utilizadores).
-- Espelha o que, num ambiente com Prisma funcional, viveria em prisma/seed.ts.

INSERT INTO "Category" (id, "userId", name, kind, "isSystem") VALUES
  ('cat_income_salary',   NULL, 'Salário',           'INCOME', true),
  ('cat_income_freelance',NULL, 'Freelance',         'INCOME', true),
  ('cat_income_other',    NULL, 'Outros Rendimentos','INCOME', true),
  ('cat_expense_food',    NULL, 'Alimentação',       'EXPENSE', true),
  ('cat_expense_transport',NULL,'Transporte',        'EXPENSE', true),
  ('cat_expense_housing', NULL, 'Renda / Casa',      'EXPENSE', true),
  ('cat_expense_leisure', NULL, 'Lazer',             'EXPENSE', true),
  ('cat_expense_health',  NULL, 'Saúde',             'EXPENSE', true),
  ('cat_expense_education',NULL,'Educação',          'EXPENSE', true),
  ('cat_expense_shopping',NULL, 'Compras',           'EXPENSE', true),
  ('cat_expense_other',   NULL, 'Outros',            'EXPENSE', true)
ON CONFLICT (id) DO NOTHING;
