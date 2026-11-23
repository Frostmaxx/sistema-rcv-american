-- Esquema inicial del Sistema RCV (MySQL 8+ / MariaDB 10.6+)
-- Nota: El servidor también crea estas tablas e índices automáticamente al iniciar.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  password_hint VARCHAR(255) DEFAULT NULL,
  active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cedula VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  apellido VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  email VARCHAR(255),
  direccion TEXT,
  ciudad VARCHAR(100),
  estado_region VARCHAR(100),
  fecha_nacimiento DATE,
  active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clients_created_at (created_at),
  INDEX idx_clients_nombre_apellido (nombre(50), apellido(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  policy_number VARCHAR(50) UNIQUE NOT NULL,
  client_id INT NOT NULL,
  tipo_vehiculo VARCHAR(50) NOT NULL,
  placa VARCHAR(20) NOT NULL,
  marca VARCHAR(100) NOT NULL,
  modelo VARCHAR(100) NOT NULL,
  anio INT NOT NULL,
  color VARCHAR(50),
  serial_carroceria VARCHAR(100),
  serial_motor VARCHAR(100),
  clase VARCHAR(100),
  uso VARCHAR(100),
  cobertura VARCHAR(100) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  prima DECIMAL(12,2) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado VARCHAR(50) DEFAULT 'activa',
  notas TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_policies_created_at (created_at),
  INDEX idx_policies_estado_created (estado, created_at),
  INDEX idx_policies_placa (placa),
  INDEX idx_policies_cobertura (cobertura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coverages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) UNIQUE NOT NULL,
  descripcion TEXT,
  prima DECIMAL(12,2) DEFAULT 0,
  cob_1_nombre VARCHAR(255), cob_1_monto DECIMAL(12,2) DEFAULT 0,
  cob_2_nombre VARCHAR(255), cob_2_monto DECIMAL(12,2) DEFAULT 0,
  cob_3_nombre VARCHAR(255), cob_3_monto DECIMAL(12,2) DEFAULT 0,
  cob_4_nombre VARCHAR(255), cob_4_monto DECIMAL(12,2) DEFAULT 0,
  cob_5_nombre VARCHAR(255), cob_5_monto DECIMAL(12,2) DEFAULT 0,
  cob_6_nombre VARCHAR(255), cob_6_monto DECIMAL(12,2) DEFAULT 0,
  cob_7_nombre VARCHAR(255), cob_7_monto DECIMAL(12,2) DEFAULT 0,
  cob_8_nombre VARCHAR(255), cob_8_monto DECIMAL(12,2) DEFAULT 0,
  cob_9_nombre VARCHAR(255), cob_9_monto DECIMAL(12,2) DEFAULT 0,
  cob_10_nombre VARCHAR(255), cob_10_monto DECIMAL(12,2) DEFAULT 0,
  active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sequences (
  name VARCHAR(50) PRIMARY KEY,
  value INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  username VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(50) NULL,
  details TEXT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created_at (created_at),
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
