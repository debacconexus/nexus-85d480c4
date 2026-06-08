const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS districts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        country VARCHAR(100) NOT NULL,
        region VARCHAR(100),
        population INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS field_workers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50),
        district_id INTEGER REFERENCES districts(id),
        organization VARCHAR(255),
        certification VARCHAR(255),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS maternal_deaths (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(100) UNIQUE NOT NULL,
        woman_name VARCHAR(255) NOT NULL,
        age INTEGER,
        date_of_death DATE NOT NULL,
        place_of_death VARCHAR(255),
        district_id INTEGER REFERENCES districts(id),
        field_worker_id INTEGER REFERENCES field_workers(id),
        pregnancy_status VARCHAR(50) CHECK (pregnancy_status IN ('pregnant', 'during_delivery', 'postpartum_42days', 'postpartum_1year')),
        gestation_weeks INTEGER,
        cause_of_death TEXT,
        direct_cause VARCHAR(255),
        indirect_cause VARCHAR(255),
        preventable BOOLEAN,
        prevention_measures TEXT,
        healthcare_access VARCHAR(100),
        delivery_location VARCHAR(100),
        skilled_attendant BOOLEAN,
        previous_pregnancies INTEGER,
        antenatal_visits INTEGER,
        complications TEXT,
        socioeconomic_factors TEXT,
        notes TEXT, -- [IGM-GOVERNED] All death investigation notes and case details
        investigation_status VARCHAR(50) DEFAULT 'pending' CHECK (investigation_status IN ('pending', 'in_progress', 'completed', 'reported')),
        reported_to_un BOOLEAN DEFAULT false,
        report_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS death_reviews (
        id SERIAL PRIMARY KEY,
        maternal_death_id INTEGER REFERENCES maternal_deaths(id),
        reviewer_name VARCHAR(255),
        review_date DATE,
        review_type VARCHAR(100) CHECK (review_type IN ('facility', 'community', 'expert_panel', 'autopsy')),
        findings TEXT, -- [IGM-GOVERNED] Detailed review findings and recommendations
        recommendations TEXT, -- [IGM-GOVERNED] Action items and system improvements
        preventability_score INTEGER CHECK (preventability_score BETWEEN 1 AND 5),
        quality_of_care_score INTEGER CHECK (quality_of_care_score BETWEEN 1 AND 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS un_reports (
        id SERIAL PRIMARY KEY,
        report_period VARCHAR(50) NOT NULL,
        district_id INTEGER REFERENCES districts(id),
        total_deaths INTEGER DEFAULT 0,
        preventable_deaths INTEGER DEFAULT 0,
        direct_deaths INTEGER DEFAULT 0,
        indirect_deaths INTEGER DEFAULT 0,
        maternal_mortality_ratio DECIMAL(10,2),
        report_data JSONB, -- [IGM-GOVERNED] Complete UN report data and statistics
        submitted_date DATE,
        submission_status VARCHAR(50) DEFAULT 'draft' CHECK (submission_status IN ('draft', 'review', 'submitted', 'accepted')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        organization VARCHAR(255),
        role VARCHAR(100),
        district_id INTEGER REFERENCES districts(id),
        contact_type VARCHAR(50) CHECK (contact_type IN ('field_worker', 'supervisor', 'health_official', 'un_contact', 'emergency')),
        active BOOLEAN DEFAULT true,
        notes TEXT, -- [IGM-GOVERNED] Contact details and communication history
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Routes

// Districts CRUD
app.get('/api/districts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM districts ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/districts', async (req, res) => {
  try {
    const { name, country, region, population } = req.body;
    const result = await pool.query(
      'INSERT INTO districts (name, country, region, population) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, country, region, population]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/districts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, country, region, population } = req.body;
    const result = await pool.query(
      'UPDATE districts SET name = $1, country = $2, region = $3, population = $4 WHERE id = $5 RETURNING *',
      [name, country, region, population, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/districts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM districts WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Field Workers CRUD
app.get('/api/field-workers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fw.*, d.name as district_name 
      FROM field_workers fw 
      LEFT JOIN districts d ON fw.district_id = d.id 
      ORDER BY fw.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/field-workers', async (req, res) => {
  try {
    const { name, email, phone, district_id, organization, certification } = req.body;
    const result = await pool.query(
      'INSERT INTO field_workers (name, email, phone, district_id, organization, certification) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, phone, district_id, organization, certification]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/field-workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, district_id, organization, certification, active } = req.body;
    const result = await pool.query(
      'UPDATE field_workers SET name = $1, email = $2, phone = $3, district_id = $4, organization = $5, certification = $6, active = $7 WHERE id = $8 RETURNING *',
      [name, email, phone, district_id, organization, certification, active, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/field-workers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM field_workers WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Maternal Deaths CRUD
app.get('/api/maternal-deaths', async (req, res) => {
  try {
    const { district_id, status, preventable, reported } = req.query;
    let query = `
      SELECT md.*, d.name as district_name, fw.name as field_worker_name 
      FROM maternal_deaths md 
      LEFT JOIN districts d ON md.district_id = d.id 
      LEFT JOIN field_workers fw ON md.field_worker_id = fw.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (district_id) {
      paramCount++;
      query += ` AND md.district_id = $${paramCount}`;
      params.push(district_id);
    }

    if (status) {
      paramCount++;
      query += ` AND md.investigation_status = $${paramCount}`;
      params.push(status);
    }

    if (preventable !== undefined) {
      paramCount++;
      query += ` AND md.preventable = $${paramCount}`;
      params.push(preventable === 'true');
    }

    if (reported !== undefined) {
      paramCount++;
      query += ` AND md.reported_to_un = $${paramCount}`;
      params.push(reported === 'true');
    }

    query += ' ORDER BY md.date_of_death DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT md.*, d.name as district_name, fw.name as field_worker_name 
      FROM maternal_deaths md 
      LEFT JOIN districts d ON md.district_id = d.id 
      LEFT JOIN field_workers fw ON md.field_worker_id = fw.id 
      WHERE md.id = $1
    `, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maternal-deaths', async (req, res) => {
  try {
    const {
      case_number, woman_name, age, date_of_death, place_of_death,
      district_id, field_worker_id, pregnancy_status, gestation_weeks,
      cause_of_death, direct_cause, indirect_cause, preventable,
      prevention_measures, healthcare_access, delivery_location,
      skilled_attendant, previous_pregnancies, antenatal_visits,
      complications, socioeconomic_factors, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO maternal_deaths (
        case_number, woman_name, age, date_of_death, place_of_death,
        district_id, field_worker_id, pregnancy_status, gestation_weeks,
        cause_of_death, direct_cause, indirect_cause, preventable,
        prevention_measures, healthcare_access, delivery_location,
        skilled_attendant, previous_pregnancies, antenatal_visits,
        complications, socioeconomic_factors, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *
    `, [
      case_number, woman_name, age, date_of_death, place_of_death,
      district_id, field_worker_id, pregnancy_status, gestation_weeks,
      cause_of_death, direct_cause, indirect_cause, preventable,
      prevention_measures, healthcare_access, delivery_location,
      skilled_attendant, previous_pregnancies, antenatal_visits,
      complications, socioeconomic_factors, notes
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      case_number, woman_name, age, date_of_death, place_of_death,
      district_id, field_worker_id, pregnancy_status, gestation_weeks,
      cause_of_death, direct_cause, indirect_cause, preventable,
      prevention_measures, healthcare_access, delivery_location,
      skilled_attendant, previous_pregnancies, antenatal_visits,
      complications, socioeconomic_factors, notes, investigation_status,
      reported_to_un, report_date
    } = req.body;

    const result = await pool.query(`
      UPDATE maternal_deaths SET 
        case_number = $1, woman_name = $2, age = $3, date_of_death = $4, 
        place_of_death = $5, district_id = $6, field_worker_id = $7,
        pregnancy_status = $8, gestation_weeks = $9, cause_of_death = $10,
        direct_cause = $11, indirect_cause = $12, preventable = $13,
        prevention_measures = $14, healthcare_access = $15, delivery_location = $16,
        skilled_attendant = $17, previous_pregnancies = $18, antenatal_visits = $19,
        complications = $20, socioeconomic_factors = $21, notes = $22,
        investigation_status = $23, reported_to_un = $24, report_date = $25,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $26 RETURNING *
    `, [
      case_number, woman_name, age, date_of_death, place_of_death,
      district_id, field_worker_id, pregnancy_status, gestation_weeks,
      cause_of_death, direct_cause, indirect_cause, preventable,
      prevention_measures, healthcare_access, delivery_location,
      skilled_attendant, previous_pregnancies, antenatal_visits,
      complications, socioeconomic_factors, notes, investigation_status,
      reported_to_un, report_date, id
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maternal-deaths/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM maternal_deaths WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Death Reviews CRUD
app.get('/api/death-reviews/:maternal_death_id', async (req, res) => {
  try {
    const { maternal_death_id } = req.params;
    const result = await pool.query(
      'SELECT * FROM death_reviews WHERE maternal_death_id = $1 ORDER BY review_date DESC',
      [maternal_death_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/death-reviews', async (req, res) => {
  try {
    const {
      maternal_death_id, reviewer_name, review_date, review_type,
      findings, recommendations, preventability_score, quality_of_care_score
    } = req.body;

    const result = await pool.query(`
      INSERT INTO death_reviews (
        maternal_death_id, reviewer_name, review_date, review_type,
        findings, recommendations, preventability_score, quality_of_care_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [
      maternal_death_id, reviewer_name, review_date, review_type,
      findings, recommendations, preventability_score, quality_of_care_score
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UN Reports CRUD
app.get('/api/un-reports', async (req, res) => {
  try {
    const { district_id, period, status } = req.query;
    let query = `
      SELECT ur.*, d.name as district_name 
      FROM un_reports ur 
      LEFT JOIN districts d ON ur.district_id = d.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (district_id) {
      paramCount++;
      query += ` AND ur.district_id = $${paramCount}`;
      params.push(district_id);
    }

    if (period) {
      paramCount++;
      query += ` AND ur.report_period = $${paramCount}`;
      params.push(period);
    }

    if (status) {
      paramCount++;
      query += ` AND ur.submission_status = $${paramCount}`;
      params.push(status);
    }

    query += ' ORDER BY ur.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/un-reports', async (req, res) => {
  try {
    const {
      report_period, district_id, total_deaths, preventable_deaths,
      direct_deaths, indirect_deaths, maternal_mortality_ratio,
      report_data, submitted_date, submission_status
    } = req.body;

    const result = await pool.query(`
      INSERT INTO un_reports (
        report_period, district_id, total_deaths, preventable_deaths,
        direct_deaths, indirect_deaths, maternal_mortality_ratio,
        report_data, submitted_date, submission_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
    `, [
      report_period, district_id, total_deaths, preventable_deaths,
      direct_deaths, indirect_deaths, maternal_mortality_ratio,
      report_data, submitted_date, submission_status
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contacts endpoint
app.get('/api/contacts', async (req, res) => {
  try {
    const { contact_type, district_id } = req.query;
    let query = `
      SELECT c.*, d.name as district_name 
      FROM contacts c 
      LEFT JOIN districts d ON c.district_id = d.id 
      WHERE c.active = true
    `;
    const params = [];
    let paramCount = 0;

    if (contact_type) {
      paramCount++;
      query += ` AND c.contact_type = $${paramCount}`;
      params.push(contact_type);
    }

    if (district_id) {
      paramCount++;
      query += ` AND c.district_id = $${paramCount}`;
      params.push(district_id);
    }

    query += ' ORDER BY c.name';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const {
      name, email, phone, organization, role, district_id, 
      contact_type, notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO contacts (
        name, email, phone, organization, role, district_id, 
        contact_type, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [name, email, phone, organization, role, district_id, contact_type, notes]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const { district_id, start_date, end_date } = req.query;
    
    // Base conditions for date filtering
    let dateCondition = '';
    let params = [];
    let paramCount = 0;

    if (start_date && end_date) {
      paramCount += 2;
      dateCondition = ` AND date_of_death BETWEEN $${paramCount - 1} AND $${paramCount}`;
      params.push(start_date, end_date);
    }

    if (district_id) {
      paramCount++;
      dateCondition += ` AND district_id = $${paramCount}`;
      params.push(district_id);
    }

    // Total deaths
    const totalDeathsResult = await pool.query(
      `SELECT COUNT(*) as count FROM maternal_deaths WHERE 1=1${dateCondition}`,
      params
    );

    // Preventable deaths
    const preventableDeathsResult = await pool.query(
      `SELECT COUNT(*) as count FROM maternal_deaths WHERE preventable = true${dateCondition}`,
      params
    );

    // Deaths by pregnancy status
    const pregnancyStatusResult = await pool.query(
      `SELECT pregnancy_status, COUNT(*) as count 
       FROM maternal_deaths 
       WHERE 1=1${dateCondition}
       GROUP BY pregnancy_status`,
      params
    );

    // Deaths by cause (direct vs indirect)
    const causesResult = await pool.query(
      `SELECT 
         COUNT(CASE WHEN direct_cause IS NOT NULL THEN 1 END) as direct_deaths,
         COUNT(CASE WHEN indirect_cause IS NOT NULL THEN 1 END)
});

}
