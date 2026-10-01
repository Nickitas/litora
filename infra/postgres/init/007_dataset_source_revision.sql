ALTER TABLE datasets
    ADD COLUMN source_revision text
        CHECK (source_revision IS NULL OR char_length(source_revision) BETWEEN 1 AND 120);

-- Историческим наборам нельзя приписать неизвестную версию источника.
