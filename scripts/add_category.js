const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const DB_PATH = path.join(__dirname, '../public/data/attributes.json');

async function main() {
    const url = process.argv[2];
    if (!url) {
        console.error('Please provide the XML URL');
        process.exit(1);
    }

    console.log('Fetching:', url);
    const res = await fetch(url);
    if (!res.ok) {
        console.error('Failed to fetch:', res.status);
        process.exit(1);
    }
    const xmlData = await res.text();

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: ""
    });
    const jsonObj = parser.parse(xmlData);

    let db = {};
    if (fs.existsSync(DB_PATH)) {
        db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }

    const categories = jsonObj.categories.category;
    const catList = Array.isArray(categories) ? categories : [categories];

    for (const cat of catList) {
        if (!cat) continue;
        
        const catId = cat.id;
        const catName = cat.nameUK || cat.nameRU;
        
        const attributes = [];
        
        const attrs = cat.attribute;
        const attrList = Array.isArray(attrs) ? attrs : [attrs];
        
        for (const attr of attrList) {
            if (!attr) continue;
            
            const attribute = {
                id: attr.id,
                name: attr.nameUK || attr.nameRU,
                type: attr.type,
                unit: attr.measureUnitUK || attr.measureUnitRU || ''
            };
            
            if (attr.attribute_value) {
                const values = Array.isArray(attr.attribute_value) ? attr.attribute_value : [attr.attribute_value];
                attribute.values = values.map(v => v.nameUK || v.nameRU).filter(Boolean);
            }
            
            attributes.push(attribute);
        }
        
        db[catId] = {
            name: catName,
            attributes: attributes
        };
        console.log(`Added/Updated category: ${catName} (ID: ${catId}) with ${attributes.length} attributes.`);
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    console.log('Database updated successfully!');
}

main();
