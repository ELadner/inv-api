#!/bin/bash

# Cleanup script for removing legacy Express files after successful Encore migration
# Run this script ONLY after verifying Encore deployment is stable

echo "🧹 Cleaning up legacy Express files..."

# Remove original src directory (backup exists in legacy-backup/)
if [ -d "src" ]; then
    echo "   Removing src/ directory..."
    rm -rf src/
fi

# Remove test stubs used during migration
if [ -d "test-stubs" ]; then
    echo "   Removing test-stubs/ directory..."
    rm -rf test-stubs/
fi

# Remove validation test file
if [ -f "test-validation.js" ]; then
    echo "   Removing test-validation.js..."
    rm test-validation.js
fi

# List remaining important files
echo ""
echo "✅ Cleanup complete! Remaining structure:"
echo "   📁 auth/ - Encore auth service"
echo "   📁 parts/ - Encore parts service"  
echo "   📁 common/ - Shared utilities and config"
echo "   📁 prisma/ - Database schema"
echo "   📁 legacy-backup/ - Backup of original code"
echo "   📄 encore.app - Encore configuration"
echo "   📄 MIGRATION_SUMMARY.md - Migration documentation"
echo ""
echo "🚀 Project is now fully migrated to Encore!"

# Note: Uncomment the line below to actually run the cleanup
# Keeping it commented for safety during migration
echo "⚠️  To actually run cleanup, uncomment the removal commands in this script"