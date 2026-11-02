BEGIN;
-- Directive (EU) 2023/970 Art. 7(2) and Art. 9(9)-(10): besides the individual pay information, workers, their
-- representatives, the labour inspectorate and equality bodies may ask for additional clarifications of the data and
-- of gender pay differences, and the employer must give a substantiated reply.
ALTER TABLE info_requests DROP CONSTRAINT IF EXISTS info_requests_channel_check;
ALTER TABLE info_requests ADD CONSTRAINT info_requests_channel_check CHECK (channel IN ('worker','representative','equality_body','labour_inspectorate'));
ALTER TABLE info_requests ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'information' CHECK (kind IN ('information','clarification'));
COMMIT;
