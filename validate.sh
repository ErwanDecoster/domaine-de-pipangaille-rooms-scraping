#!/bin/bash
# Script de validation de la structure de l'add-on Home Assistant

set -e

echo "🔍 Validation de la structure de l'add-on..."
echo ""

ERRORS=0

# Vérifier les fichiers requis
echo "📋 Vérification des fichiers requis..."

REQUIRED_FILES=(
    "config.yaml"
    "Dockerfile"
    "rootfs/etc/cont-init.d/01-init.sh"
    "rootfs/etc/services.d/guest-manager/run"
    "rootfs/etc/services.d/guest-manager/finish"
    "rootfs/app/package.json"
    "rootfs/app/src/server.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file - MANQUANT"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "🔐 Vérification des permissions..."

EXECUTABLE_FILES=(
    "rootfs/etc/cont-init.d/01-init.sh"
    "rootfs/etc/services.d/guest-manager/run"
    "rootfs/etc/services.d/guest-manager/finish"
)

for file in "${EXECUTABLE_FILES[@]}"; do
    if [ -x "$file" ]; then
        echo "  ✅ $file est exécutable"
    else
        echo "  ⚠️  $file n'est pas exécutable (sera corrigé dans le Dockerfile)"
    fi
done

echo ""
echo "📝 Vérification du shebang bashio..."

BASHIO_FILES=(
    "rootfs/etc/cont-init.d/01-init.sh"
    "rootfs/etc/services.d/guest-manager/run"
)

for file in "${BASHIO_FILES[@]}"; do
    if head -n 1 "$file" | grep -q "with-contenv bashio"; then
        echo "  ✅ $file utilise bashio"
    else
        echo "  ❌ $file n'utilise pas bashio correctement"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "🚫 Vérification qu'il n'y a pas de CMD dans Dockerfile..."

if grep -q "^CMD" Dockerfile; then
    echo "  ❌ CMD trouvé dans Dockerfile (ne devrait pas être là)"
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ Pas de CMD dans Dockerfile"
fi

echo ""
echo "📦 Vérification que run.sh n'existe plus à la racine..."

if [ -f "run.sh" ]; then
    echo "  ❌ run.sh existe encore à la racine (devrait être supprimé)"
    ERRORS=$((ERRORS + 1))
else
    echo "  ✅ run.sh supprimé de la racine"
fi

echo ""
echo "🔧 Vérification de config.yaml..."

if grep -q "init: false" config.yaml; then
    echo "  ✅ init: false présent dans config.yaml"
else
    echo "  ⚠️  init: false manquant dans config.yaml (recommandé pour s6-overlay v3)"
fi

echo ""
echo "================================"

if [ $ERRORS -eq 0 ]; then
    echo "✅ VALIDATION RÉUSSIE !"
    echo "L'add-on est correctement configuré pour s6-overlay."
    echo ""
    echo "Prochaines étapes :"
    echo "  1. Exécuter ./build.sh pour construire l'image"
    echo "  2. Installer dans Home Assistant"
    echo "  3. Configurer les credentials"
    echo "  4. Démarrer l'add-on"
    exit 0
else
    echo "❌ VALIDATION ÉCHOUÉE avec $ERRORS erreur(s)"
    echo "Veuillez corriger les erreurs ci-dessus."
    exit 1
fi
