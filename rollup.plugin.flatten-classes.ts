// rollup.plugin.flatten-classes.js
import * as ts from 'typescript';
import MagicString from 'magic-string';
import path from 'path';
import fs from 'fs';

export default function flattenClasses() {
    return {
        name: 'flatten-classes',
        async transform(code, id) {
            if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return;
            if (!code.includes('@Flatten')) return;

            const magicString = new MagicString(code);
            
            // Parse the TypeScript code
            const sourceFile = ts.createSourceFile(
                id,
                code,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS
            );

            let hasChanges = false;

            // Find all classes with @Flatten decorator
            const classesToProcess = [];
            
            ts.forEachChild(sourceFile, function visit(node) {
                if (ts.isClassDeclaration(node)) {
                    const hasFlattennDecorator = node.decorators?.some(decorator => {
                        if (ts.isDecorator(decorator) && ts.isIdentifier(decorator.expression)) {
                            return decorator.expression.text === 'Flatten';
                        }
                        return false;
                    });

                    if (hasFlattennDecorator) {
                        classesToProcess.push(node);
                    }
                }
                ts.forEachChild(node, visit);
            });

            for (const classNode of classesToProcess) {
                try {
                    await processClass(classNode, sourceFile, magicString, id);
                    hasChanges = true;
                } catch (error) {
                    console.warn(`Failed to process class in ${id}:`, error);
                }
            }

            if (!hasChanges) return;

            return {
                code: magicString.toString(),
                map: magicString.generateMap({
                    source: id,
                    includeContent: true,
                    hires: true
                })
            };
        }
    };
}

async function processClass(classNode, sourceFile, magicString, currentFile) {
    // Remove @Flatten decorator
    const flattenDecorator = classNode.decorators?.find(decorator => {
        if (ts.isDecorator(decorator) && ts.isIdentifier(decorator.expression)) {
            return decorator.expression.text === 'Flatten';
        }
        return false;
    });

    if (flattenDecorator) {
        const decoratorStart = flattenDecorator.getFullStart();
        const decoratorEnd = flattenDecorator.getEnd();
        magicString.remove(decoratorStart, decoratorEnd);
    }

    // Check if class extends another class
    const extendsClause = classNode.heritageClauses?.find(clause => 
        clause.token === ts.SyntaxKind.ExtendsKeyword
    );

    if (!extendsClause || !extendsClause.types[0]) return;

    const baseTypeNode = extendsClause.types[0];
    const baseClassName = getBaseClassName(baseTypeNode);
    
    if (!baseClassName) return;

    // Find the base class file
    const baseClassFile = await findBaseClassFile(baseClassName, sourceFile, currentFile);
    if (!baseClassFile) return;

    // Load and parse the base class
    const baseClassCode = fs.readFileSync(baseClassFile, 'utf-8');
    const baseSourceFile = ts.createSourceFile(
        baseClassFile,
        baseClassCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    const baseClass = findClassInFile(baseSourceFile, baseClassName);
    if (!baseClass) return;

    // Analyze conflicts
    const conflicts = findMethodConflicts(classNode, baseClass);
    
    // Generate flattened class content
    const flattenedMembers = await generateFlattenedMembers(
        classNode, 
        baseClass, 
        conflicts
    );

    // Replace the class content
    await replaceClassContent(classNode, flattenedMembers, magicString, conflicts);
}

function getBaseClassName(baseTypeNode) {
    if (ts.isIdentifier(baseTypeNode.expression)) {
        return baseTypeNode.expression.text;
    }
    if (ts.isPropertyAccessExpression(baseTypeNode.expression)) {
        return baseTypeNode.expression.name.text;
    }
    return null;
}

async function findBaseClassFile(baseClassName, sourceFile, currentFile) {
    const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
    
    for (const importDecl of importDeclarations) {
        if (!importDecl.moduleSpecifier || !ts.isStringLiteral(importDecl.moduleSpecifier)) {
            continue;
        }

        const modulePath = importDecl.moduleSpecifier.text;
        const importClause = importDecl.importClause;
        
        if (!importClause) continue;

        // Check named imports
        if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
            const hasNamedImport = importClause.namedBindings.elements.some(element => {
                const name = element.propertyName?.text || element.name.text;
                return name === baseClassName;
            });

            if (hasNamedImport) {
                return await resolveImportPath(modulePath, currentFile);
            }
        }

        // Check namespace imports
        if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
            const namespaceName = importClause.namedBindings.name.text;
            if (baseClassName.startsWith(`${namespaceName}.`)) {
                return await resolveImportPath(modulePath, currentFile);
            }
        }

        // Check default imports
        if (importClause.name && importClause.name.text === baseClassName) {
            return await resolveImportPath(modulePath, currentFile);
        }
    }

    return null;
}

function findClassInFile(sourceFile, className) {
    let foundClass = null;
    
    ts.forEachChild(sourceFile, function visit(node) {
        if (ts.isClassDeclaration(node) && node.name?.text === className) {
            foundClass = node;
            return;
        }
        ts.forEachChild(node, visit);
    });
    
    return foundClass;
}

function findMethodConflicts(derivedClass, baseClass) {
    const conflicts = new Set();
    
    const derivedMethods = new Set();
    derivedClass.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            derivedMethods.add(member.name.text);
        }
    });

    baseClass.members.forEach(member => {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            const methodName = member.name.text;
            if (derivedMethods.has(methodName)) {
                conflicts.add(methodName);
            }
        }
    });

    return conflicts;
}

async function generateFlattenedMembers(derivedClass, baseClass, conflicts) {
    const printer = ts.createPrinter();
    const sourceFile = derivedClass.getSourceFile();
    const members = [];

    // Add base class members
    baseClass.members.forEach(member => {
        if (ts.isConstructorDeclaration(member)) {
            // Skip base constructor - we'll handle it separately
            return;
        }

        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            const methodName = member.name.text;
            
            if (conflicts.has(methodName)) {
                // Rename conflicting base methods
                const newName = `__base_${methodName}`;
                const modifiedMember = ts.factory.updateMethodDeclaration(
                    member,
                    member.modifiers,
                    member.asteriskToken,
                    ts.factory.createIdentifier(newName),
                    member.questionToken,
                    member.typeParameters,
                    member.parameters,
                    member.type,
                    member.body
                );
                members.push(printer.printNode(ts.EmitHint.Unspecified, modifiedMember, sourceFile));
            } else {
                members.push(printer.printNode(ts.EmitHint.Unspecified, member, sourceFile));
            }
        } else if (!isPrivateMember(member)) {
            // Add non-private, non-constructor members
            members.push(printer.printNode(ts.EmitHint.Unspecified, member, sourceFile));
        }
    });

    // Add derived class members (with updated super calls)
    derivedClass.members.forEach(member => {
        if (ts.isMethodDeclaration(member)) {
            const updatedMember = updateSuperCalls(member, conflicts);
            members.push(printer.printNode(ts.EmitHint.Unspecified, updatedMember, sourceFile));
        } else if (ts.isConstructorDeclaration(member)) {
            const updatedConstructor = await mergeConstructors(member, baseClass);
            members.push(printer.printNode(ts.EmitHint.Unspecified, updatedConstructor, sourceFile));
        } else {
            members.push(printer.printNode(ts.EmitHint.Unspecified, member, sourceFile));
        }
    });

    return members;
}

function isPrivateMember(member) {
    return member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword) || false;
}

function updateSuperCalls(method, conflicts) {
    const transformer = (context) => {
        const visit = (node) => {
            if (ts.isCallExpression(node) && 
                ts.isPropertyAccessExpression(node.expression) &&
                ts.isSuper(node.expression.expression) &&
                ts.isIdentifier(node.expression.name)) {
                
                const methodName = node.expression.name.text;
                if (conflicts.has(methodName)) {
                    // Replace super.method() with this.__base_method()
                    return ts.factory.updateCallExpression(
                        node,
                        ts.factory.createPropertyAccessExpression(
                            ts.factory.createThis(),
                            ts.factory.createIdentifier(`__base_${methodName}`)
                        ),
                        node.typeArguments,
                        node.arguments
                    );
                }
            }
            return ts.visitEachChild(node, visit, context);
        };
        return visit;
    };

    const result = ts.transform(method, [transformer]);
    return result.transformed[0];
}

async function mergeConstructors(derivedConstructor, baseClass) {
    const baseConstructor = baseClass.members.find(ts.isConstructorDeclaration);
    
    if (!baseConstructor) {
        // Remove super() calls from derived constructor
        return removeSuperCalls(derivedConstructor);
    }

    // Merge constructor bodies
    const baseBody = baseConstructor.body?.statements || [];
    const derivedBody = derivedConstructor.body?.statements || [];
    
    // Remove super() calls from derived body
    const filteredDerivedBody = derivedBody.filter(stmt => {
        if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
            return !ts.isSuper(stmt.expression.expression);
        }
        return true;
    });

    const mergedBody = [...baseBody, ...filteredDerivedBody];

    return ts.factory.updateConstructorDeclaration(
        derivedConstructor,
        derivedConstructor.modifiers,
        derivedConstructor.parameters,
        ts.factory.createBlock(mergedBody, true)
    );
}

function removeSuperCalls(constructor) {
    const body = constructor.body?.statements || [];
    const filteredBody = body.filter(stmt => {
        if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
            return !ts.isSuper(stmt.expression.expression);
        }
        return true;
    });

    return ts.factory.updateConstructorDeclaration(
        constructor,
        constructor.modifiers,
        constructor.parameters,
        ts.factory.createBlock(filteredBody, true)
    );
}

async function replaceClassContent(classNode, flattenedMembers, magicString, conflicts) {
    // Find the class body
    const openBrace = classNode.members.pos;
    const closeBrace = classNode.end - 1;
    
    // Remove extends clause
    const extendsClause = classNode.heritageClauses?.find(clause => 
        clause.token === ts.SyntaxKind.ExtendsKeyword
    );
    
    if (extendsClause) {
        const extendsStart = extendsClause.getFullStart();
        const extendsEnd = extendsClause.getEnd();
        magicString.remove(extendsStart, extendsEnd);
    }

    // Replace class body
    const newBody = '\n    ' + flattenedMembers.join('\n    ') + '\n';
    magicString.overwrite(openBrace, closeBrace, newBody);
}

async function resolveImportPath(importPath, currentFile) {
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    
    // Handle relative paths
    if (importPath.startsWith('.')) {
        const baseDir = path.dirname(currentFile);
        const absoluteBase = path.resolve(baseDir, importPath);
        
        for (const ext of extensions) {
            const tryPath = absoluteBase + ext;
            if (fs.existsSync(tryPath)) return tryPath;
        }
        
        // Try index files
        for (const ext of extensions) {
            const tryIndex = path.join(absoluteBase, 'index' + ext);
            if (fs.existsSync(tryIndex)) return tryIndex;
        }
    }
    
    // Handle node_modules
    if (!importPath.startsWith('.')) {
        try {
            const resolved = require.resolve(importPath, {
                paths: [path.dirname(currentFile)]
            });
            return resolved;
        } catch (e) {
            // Try with extensions
            for (const ext of extensions) {
                try {
                    const resolved = require.resolve(importPath + ext, {
                        paths: [path.dirname(currentFile)]
                    });
                    return resolved;
                } catch (e) {
                    // Continue trying
                }
            }
        }
    }
    
    return null;
}