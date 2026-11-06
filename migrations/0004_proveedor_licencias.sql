ALTER TABLE licencias ADD COLUMN proveedor TEXT CHECK (proveedor IN ('Next-PoC','Hytera') OR proveedor IS NULL);
