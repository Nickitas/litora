-- Ранняя локальная версия миграции 014 могла быть применена до добавления
-- lock_token в опубликованный SQL. Runner запоминает имя файла и не повторяет
-- изменённую миграцию; новый номер выравнивает уже созданные базы.
ALTER TABLE calculation_deletion_items
    ADD COLUMN IF NOT EXISTS lock_token uuid;
