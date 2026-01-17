import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Returns true if the class declaration has the @Flatten() decorator.
 * @param node 
 * @returns 
 */
function hasFlattenDecorator(node: ts.ClassDeclaration): boolean
{
    return !!ts.getDecorators(node)?.some(d =>
        ts.isCallExpression(d.expression) &&
        ts.isIdentifier(d.expression.expression) &&
        d.expression.expression.text === 'Flatten'
    );
}

/**
 * Return the names of the methods that exist in both of the classes.
 * @param derivedClass 
 * @param baseClass 
 * @returns 
 */
function findMethodConflicts(derivedClass: ts.ClassDeclaration, baseClass: ts.ClassDeclaration) : Set<string>
{
    const conflicts = new Set<string>();

    const derivedMethods = new Set();
    derivedClass.members.forEach(member =>
    {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name))
        {
            derivedMethods.add(member.name.text);
        }
    });

    baseClass.members.forEach(member =>
    {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name))
        {
            const methodName = member.name.text;
            if (derivedMethods.has(methodName))
            {
                conflicts.add(methodName);
            }
        }
    });

    return conflicts;
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
                if (ts.isClassDeclaration(node) && hasFlattenDecorator(node))
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






        function createFlattenedConstructor(
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

        function flattenClass(cls: ts.ClassDeclaration, file: ts.SourceFile): ts.ClassDeclaration
        {
            if (!cls.heritageClauses)
                return cls;

            const extendsClause = cls.heritageClauses.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
            if (!extendsClause || extendsClause.types.length === 0)
                return cls;

            const baseTypeNode = extendsClause.types[0];
            const baseType = checker.getTypeAtLocation(baseTypeNode);
            const baseSymbol = baseType.getSymbol();
            if (!baseSymbol || !baseSymbol.declarations?.length)
                return cls;

            const baseClass = baseSymbol.declarations[0];
            if (!ts.isClassDeclaration(baseClass))
                return cls;

            // Analyze conflicts
            const conflicts = findMethodConflicts(cls, baseClass);

            // Process base members
            const baseMembers = baseClass.members
                .filter(m => !ts.isConstructorDeclaration(m))
                .map(member =>
                {
                    if (ts.isConstructorDeclaration(member))
                    {
                        // Skip base constructor - we'll handle it separately
                        return undefined!;
                    }

                    if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name) && member.body)
                    {

                        let method = member as ts.MethodDeclaration;
                        let methodName = member.name.text;

                        if (conflicts.has(methodName)) 
                        {
                            // Rename conflicting base methods
                            methodName = `__base_${methodName}`;
                        }

                        let body = method.body;

                        if (body)
                        {
                            let statements = body.statements;

                            body = ts.factory.createBlock(statements);
                            let _statements = statements.map(statement =>
                            {
                                // Due to what I assume is a bug string literals disappear unless they are recreated from scratch.
                                function visit(node: ts.Node)
                                {
                                    if (node.kind === ts.SyntaxKind["StringLiteral"])
                                    {
                                        console.log("Replacing ", node.getText());

                                        // TODO
                                        // ts.setSourceMapRange(result, v);
                                        // ts.setTextRange(result,v);

                                        return ts.factory.createStringLiteral(
                                            node.getText().slice(1, -1),
                                            false
                                        );
                                    }

                                    return ts.visitEachChild(
                                        node,
                                        child => visit(child),
                                        context
                                    );
                                }

                                return visit(statement);
                            }

                            );
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
                    return member;
                }).filter(Boolean).filter(m => !ts.isConstructorDeclaration(m!));

            const cls_members = cls.members.map(member =>
            {
                if (ts.isMethodDeclaration(member)) 
                {
                    const updatedMember = updateSuperCalls(member, conflicts);
                    members.push(printer.printNode(ts.EmitHint.Unspecified, updatedMember, sourceFile));
                }
                else if (ts.isConstructorDeclaration(member))
                {
                    return createFlattenedConstructor()
                }
                return member;
            });

            return ts.factory.updateClassDeclaration(
                cls,
                // keep all modifiers except for the Flatten one
                cls.modifiers?.filter(mod => !mod.getText().match(/@Flatten\s*\(/g)),
                cls.name,
                cls.typeParameters,
                undefined, // no heritage (extends)
                [
                    ...cls_members,
                    ...baseMembers,
                ]
            );;
        }
    };
}
