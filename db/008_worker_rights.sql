BEGIN;
-- Directive (EU) 2023/970 Art. 7: workers' requests for pay information (answer within two months)
-- and the employer's annual notice of that right.
CREATE TABLE IF NOT EXISTS info_requests (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  received_on DATE NOT NULL,
  due_on DATE NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('worker','representative','equality_body')),
  requester_label VARCHAR(120) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered')),
  answered_on DATE,
  answer_summary TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS info_requests_company_due ON info_requests(company_id, due_on);
CREATE TABLE IF NOT EXISTS rights_notices (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notice_year INT NOT NULL CHECK (notice_year BETWEEN 2000 AND 2100),
  sent_on DATE NOT NULL,
  contact TEXT NOT NULL,
  PRIMARY KEY(company_id, notice_year)
);
COMMIT;
