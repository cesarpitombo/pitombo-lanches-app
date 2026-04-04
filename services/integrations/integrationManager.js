const UberEatsAdapter = require('./platforms/ubereatsAdapter');
const GlovoAdapter = require('./platforms/glovoAdapter');
const BoltFoodAdapter = require('./platforms/boltfoodAdapter');

class IntegrationManager {
    static getAdapter(platformName) {
        const platform = platformName.toUpperCase();
        switch(platform) {
            case 'UBEREATS':
                return new UberEatsAdapter();
            case 'GLOVO':
                return new GlovoAdapter();
            case 'BOLTFOOD':
                return new BoltFoodAdapter();
            default:
                throw new Error(\`Plataforma \${platformName} não suportada pelo Manager.\`);
        }
    }
}

module.exports = IntegrationManager;
