-- Villa Martius — schema prenotazioni
-- Anti-overbooking atomico tramite vincolo di esclusione (no sovrapposizioni per unità).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Unità fisiche prenotabili.
CREATE TABLE IF NOT EXISTS units (
  id        serial PRIMARY KEY,
  room_type text NOT NULL,
  label     text NOT NULL
);

-- Prenotazioni.
CREATE TABLE IF NOT EXISTS bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference     text UNIQUE NOT NULL,
  unit_id       integer NOT NULL REFERENCES units(id),
  room_type     text NOT NULL,
  check_in      date NOT NULL,
  check_out     date NOT NULL,
  guests        integer NOT NULL,
  status        text NOT NULL DEFAULT 'confermata',
  main_nome     text NOT NULL,
  main_cognome  text NOT NULL,
  main_email    text NOT NULL,
  main_telefono text NOT NULL,
  main_paese    text NOT NULL,
  main_citta    text,
  extra_ospiti  jsonb NOT NULL DEFAULT '[]'::jsonb,
  arrivo_ora    text,
  note          text,
  pagamento     text NOT NULL DEFAULT 'in_struttura',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_valid_range CHECK (check_out > check_in),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    unit_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status IN ('confermata', 'in_attesa'))
);

CREATE INDEX IF NOT EXISTS bookings_unit_dates_idx ON bookings (unit_id, check_in, check_out);

-- Inventario: 5 Camere Matrimoniali Standard + 1 ciascuna delle altre.
INSERT INTO units (room_type, label)
SELECT v.room_type, v.label
FROM (VALUES
  ('camera-standard',       'Camera Matrimoniale Standard 1'),
  ('camera-standard',       'Camera Matrimoniale Standard 2'),
  ('camera-standard',       'Camera Matrimoniale Standard 3'),
  ('camera-standard',       'Camera Matrimoniale Standard 4'),
  ('camera-standard',       'Camera Matrimoniale Standard 5'),
  ('camera-deluxe',         'Camera Matrimoniale Deluxe'),
  ('appartamento-standard', 'Appartamento Standard'),
  ('appartamento-superior', 'Appartamento Superior'),
  ('appartamento-deluxe',   'Appartamento Deluxe')
) AS v(room_type, label)
WHERE NOT EXISTS (SELECT 1 FROM units);
