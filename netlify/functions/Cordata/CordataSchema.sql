-- Cordata / Sunbiz Ingestion Schema & Evidence Ledger Store
-- Stage 4: Structured Data + Immutable Raw Evidence Ledger

CREATE TABLE IF NOT EXISTS cordata_raw_ledger (
    id SERIAL PRIMARY KEY,
    document_number VARCHAR(12) NOT NULL,
    raw_record_1440 TEXT NOT NULL,
    record_hash VARCHAR(64),
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cordata_entities (
    document_number VARCHAR(12) PRIMARY KEY,
    legal_name VARCHAR(200) NOT NULL,
    status VARCHAR(10),
    entity_type VARCHAR(10),
    filing_date VARCHAR(10),
    effective_date VARCHAR(10),
    fei_number VARCHAR(20),
    state_of_inc VARCHAR(5),
    principal_address JSONB,
    mailing_address JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cordata_officers (
    id SERIAL PRIMARY KEY,
    document_number VARCHAR(12) REFERENCES cordata_entities(document_number) ON DELETE CASCADE,
    slot_number INT NOT NULL,
    raw_identifier VARCHAR(150),
    first_name VARCHAR(50),
    last_name_or_org VARCHAR(100),
    street_address VARCHAR(150),
    city VARCHAR(50),
    state VARCHAR(5),
    zip VARCHAR(10)
);

CREATE INDEX IF NOT EXISTS idx_cordata_doc_num ON cordata_entities(document_number);
CREATE INDEX IF NOT EXISTS idx_cordata_officer_doc ON cordata_officers(document_number);
