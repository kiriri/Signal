import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Returns true if the class declaration has the @Flatten() decorator.
 * @param node 
 * @returns 
 */
function has_flatten_decorator(node: ts.ClassDeclaration): boolean
{
    return !!ts.getDecorators(node)?.some(d =>
        ts.isCallExpression(d.expression) &&
        ts.isIdentifier(d.expression.expression) &&
        d.expression.expression.text === 'Flatten'
    );
}

/**
 * Return the names of the methods that exist in both of the classes.
 * Generate a new alias for each.
 * @param derivedClass 
 * @param baseClass 
 * @returns 
 */
function find_method_conflicts(derivedClass: ts.ClassDeclaration, baseClass: ts.ClassDeclaration): Map<string, string>
{
    // Find method name conflicts
    const baseMemberNames = new Set(baseClass.members.map(member => member.name?.getText()).filter(v => v !== undefined));
    const clsMemberNames = new Set(derivedClass.members.map(member => member.name?.getText()).filter(v => v !== undefined));

    const conflictMap = new Map<string, string>();

    for (let name of baseMemberNames)
    {
        if (clsMemberNames.has(name))
            conflictMap.set(name, `__base_${name}`)
    }

    return conflictMap
}

/**
 * Merge 2 constructors by replacing the super() call in the derived function with the contents of the base function.
 * @param baseCtor 
 * @param derivedCtor 
 * @param conflictMap 
 * @returns 
 */
function merge_constructors(
    baseCtor?: ts.ConstructorDeclaration,
    derivedCtor?: ts.ConstructorDeclaration,
    conflictMap?: Map<string, string>
): ts.ConstructorDeclaration | undefined
{
    const baseStatements = baseCtor?.body?.statements ?? ts.factory.createNodeArray();
    let derivedStatements: ts.NodeArray<ts.Statement> | ts.Statement[] = (derivedCtor?.body?.statements ?? ts.factory.createNodeArray())
        .filter(statement =>
        {
            const text = statement.getText();
            return !text.startsWith("super(") &&
                !(conflictMap && Array.from(conflictMap.keys()).some(name =>
                    text.includes(`super.${name}(`))
                );
        });

    // Process super.method() calls in derived constructor
    if (conflictMap && derivedCtor?.body)
    {
        let ctorBodyText = derivedCtor.body.getText();
        conflictMap.forEach((newName, oldName) =>
        {
            ctorBodyText = ctorBodyText.replace(
                new RegExp(`super\\.${oldName}\\(`, 'g'),
                `this.${newName}(`
            );
        });
        if (ctorBodyText !== derivedCtor.body.getText())
        {
            const updatedBody = ts.createSourceFile('temp.ts', ctorBodyText, ts.ScriptTarget.Latest)
                .statements[0] as ts.Block;
            derivedStatements = updatedBody.statements;
        }
    }

    const combinedStatements = [...baseStatements, ...derivedStatements];
    if (combinedStatements.length === 0) return undefined;

    return ts.factory.createConstructorDeclaration(
        derivedCtor?.modifiers,
        derivedCtor?.parameters ?? [],
        ts.factory.createBlock(combinedStatements, true)
    );
}

export function flattenClassesTransformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile>
{
    const checker = program.getTypeChecker();

    return (context) =>
    {
        return (sourceFile) =>
        {
            let has_flatten = false;
            function visit(node: ts.Node): ts.VisitResult<ts.Node>
            {
                if (ts.isClassDeclaration(node) && has_flatten_decorator(node))
                {
                    has_flatten = true;
                    return flattenClass(node, sourceFile);
                }
                return ts.visitEachChild(node, visit, context);
            }

            const result = ts.visitNode(sourceFile, visit) as ts.SourceFile;

            if (has_flatten)
            {
                // file.
                console.log(ts.createPrinter().printFile(result))
            }

            return result;
        };

        function flattenClass(cls: ts.ClassDeclaration, file: ts.SourceFile): ts.ClassDeclaration
        {
            if (!cls.heritageClauses) return cls;

            const extendsClause = cls.heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
            if (!extendsClause || extendsClause.types.length === 0) return cls;

            const baseTypeNode = extendsClause.types[0];
            const baseType = checker.getTypeAtLocation(baseTypeNode);
            const baseSymbol = baseType.getSymbol();
            if (!baseSymbol || !baseSymbol.declarations?.length) return cls;

            const baseDecl = baseSymbol.declarations[0];
            if (!ts.isClassDeclaration(baseDecl)) return cls;

            let conflictMap = find_method_conflicts(cls, baseDecl);

            // Process base members
            // Process base members
const baseMembers = baseDecl.members
    .filter(m => !ts.isConstructorDeclaration(m))
    .map(member =>
    {
        // Hoisted here so it applies to both method bodies and property initializers.
        function visit(node: ts.Node): ts.Node
        {
            const text = node.getText().trim();
            if (ts.isStringLiteral(node))
                return ts.factory.createStringLiteral(text, false);
            if (ts.isNumericLiteral(node))
                return ts.factory.createNumericLiteral(text);
            if (ts.isBigIntLiteral(node))
                return ts.factory.createBigIntLiteral(text);
            if (node.kind === ts.SyntaxKind.TrueKeyword)
                return ts.factory.createTrue();
            if (node.kind === ts.SyntaxKind.FalseKeyword)
                return ts.factory.createFalse();
            if (node.kind === ts.SyntaxKind.NullKeyword)
                return ts.factory.createNull();
            if (ts.isNoSubstitutionTemplateLiteral(node))
                return ts.factory.createNoSubstitutionTemplateLiteral(text, node.rawText);
            if (ts.isRegularExpressionLiteral(node))
                return ts.factory.createRegularExpressionLiteral(text);
            return ts.visitEachChild(node, child => visit(child), context);
        }

        if (ts.isMethodDeclaration(member) && member.body && member.name && ts.isIdentifier(member.name))
        {
            let method = member as ts.MethodDeclaration;
            let methodName = member.name.text;

            if (conflictMap.has(methodName))
                methodName = conflictMap.get(methodName)!;

            let body = method.body;
            if (body)
            {
                const _statements = body.statements.map(s => visit(s) as ts.Statement);
                body = ts.factory.createBlock(_statements);
            }

            return ts.factory.createMethodDeclaration(
                method.modifiers,
                method.asteriskToken,
                methodName,
                method.questionToken,
                method.typeParameters,
                method.parameters,
                method.type,
                body
            );
        }

        // For properties, getters, setters, etc. — visit through children so
        // initializers like `version = 0` get their literals recreated too.
        return ts.visitEachChild(member, child => visit(child), context) as ts.ClassElement;
    }).filter(m => !ts.isConstructorDeclaration(m));

            // Process derived members to update super calls
            const updatedDerivedMembers = cls.members.map(member =>
            {
                if (!ts.isMethodDeclaration(member) || !member.body) return member;

                const visitSuperCalls = (node: ts.Node): ts.Node =>
                {
                    if (ts.isCallExpression(node) &&
                        ts.isPropertyAccessExpression(node.expression) &&
                        node.expression.expression.kind === ts.SyntaxKind.SuperKeyword)
                    {

                        const methodName = node.expression.name.text;
                        const newName = conflictMap.get(methodName);
                        if (newName)
                        {
                            return ts.factory.updateCallExpression(
                                node,
                                ts.factory.createPropertyAccessExpression(
                                    ts.factory.createThis(),
                                    ts.factory.createIdentifier(newName)
                                ),
                                node.typeArguments,
                                node.arguments
                            );
                        }
                    }
                    return ts.visitEachChild(node, visitSuperCalls, context);
                };

                const updatedBody = ts.visitEachChild(member.body, visitSuperCalls, context);
                if (updatedBody === member.body) return member;

                return ts.factory.updateMethodDeclaration(
                    member,
                    member.modifiers?.filter(mod => mod.kind !== ts.SyntaxKind["OverrideKeyword"]),
                    member.asteriskToken,
                    member.name,
                    member.questionToken,
                    member.typeParameters,
                    member.parameters,
                    member.type,
                    updatedBody
                );
            });

            // Handle constructor
            const constructorFromBase = baseDecl.members.find(ts.isConstructorDeclaration);
            const derivedConstructor = cls.members.find(ts.isConstructorDeclaration);
            const newConstructor = merge_constructors(constructorFromBase, derivedConstructor, conflictMap);

            // Combine members, filtering out duplicates
            const combinedMembers = [
                ...updatedDerivedMembers.filter(m => !ts.isConstructorDeclaration(m)),
                ...baseMembers.filter(m =>
                {
                    const name = m.name;
                    return name && !updatedDerivedMembers.some(c => c.name === name);
                }),
                ...(newConstructor ? [newConstructor] : [])
            ];

            // Create the flattened class
            return ts.factory.updateClassDeclaration(
                cls,
                cls.modifiers?.filter(mod => mod.kind !== ts.SyntaxKind.Decorator),
                cls.name,
                cls.typeParameters,
                undefined, // remove extends
                combinedMembers
            );
        }


    };
}
