#!/bin/bash
# ============================================
# Script de Deploy - Sistema RCV
# Para Shared Hosting con cPanel
# ============================================

echo "============================================"
echo "Sistema RCV - Deploy & Update Script"
echo "============================================"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Cambiar al directorio de la app
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$SCRIPT_DIR}"
if [ -d "$TARGET_DIR" ]; then
    cd "$TARGET_DIR" || exit 1
elif [ -d "$HOME/app_rcv" ]; then
    cd "$HOME/app_rcv" || exit 1
else
    echo -e "${RED}Error: No se encontró el directorio de la aplicación${NC}"; exit 1;
fi

echo -e "${GREEN}1. Verificando archivos de configuración...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: Archivo .env no encontrado${NC}"
    echo -e "${YELLOW}Copia .env.example a .env y configura los valores${NC}"
    exit 1
fi

echo -e "${GREEN}2. Verificando e instalando dependencias...${NC}"
npm install --omit=dev

echo -e "${GREEN}3. Verificando conexión a base de datos y migraciones...${NC}"
node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testAndMigrate() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        console.log('✅ Conexión a MySQL exitosa');

        // Migración automática de columnas clase y uso si no existen
        try {
            await conn.query('ALTER TABLE policies ADD COLUMN clase VARCHAR(100) DEFAULT NULL');
            console.log('✅ Columna clase asegurada en policies');
        } catch(e) {}
        try {
            await conn.query('ALTER TABLE policies ADD COLUMN uso VARCHAR(100) DEFAULT NULL');
            console.log('✅ Columna uso asegurada en policies');
        } catch(e) {}

        await conn.end();
    } catch (err) {
        console.error('❌ Error de conexión:', err.message);
        process.exit(1);
    }
}
testAndMigrate();
"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error en la conexión a la base de datos o migración${NC}"
    exit 1
fi

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Deploy y Actualización completados exitosamente!${NC}"
echo -e "${YELLOW}Reinicia la Node.js App desde la interfaz de cPanel${NC}"
echo -e "${GREEN}============================================${NC}"
