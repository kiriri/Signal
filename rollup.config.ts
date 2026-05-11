import typescript from '@rollup/plugin-typescript';
import { flattenClassesTransformer } from './ts-transformer-flatten.ts';
// Required for compile time dead branch elemination, like `if(false){}`
// We use this in combination with the use `weak ref constant`.
import replace from '@rollup/plugin-replace';
// Required to turn `let a = true ? 1 : 2` into `let a = 1`;
import terser from '@rollup/plugin-terser';


const makeConfig = (useWeakRefs: boolean, benchmark: boolean) => ({
  input: benchmark ? 'src/Tests/Benchmark/index.ts' : 'src/index.ts',
  output: {
    dir: benchmark ? `dist/${useWeakRefs ? 'weak' : 'strong'}/Tests` : `dist/${useWeakRefs ? 'weak' : 'strong'}`,
    format: 'es',
    sourcemap: true
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        $USE_WEAK_REFS$: JSON.stringify(useWeakRefs)
      }
    }),
    typescript({
      outDir: benchmark ? `dist/${useWeakRefs ? 'weak' : 'strong'}/Tests` : `dist/${useWeakRefs ? 'weak' : 'strong'}`,
      compilerOptions: {
        declaration: true,
        declarationDir: benchmark ? `dist/${useWeakRefs ? 'weak' : 'strong'}/Tests` : `dist/${useWeakRefs ? 'weak' : 'strong'}`,
        module: 'NodeNext',           // Forces ESM-compliant output
        moduleResolution: 'NodeNext', // Forces explicit extensions in .d.ts
      },
      transformers: {
        before: [
          {
            factory: flattenClassesTransformer,
            type: "program"
          }
        ]
      },
    }),
    terser(benchmark ? undefined : { // folds constant ternaries, removes dead code
      compress: {
        evaluate: true,    // folds constant expressions
        dead_code: true,   // removes unreachable branches
      },
      mangle: false,       // don't rename variables
      format: {
        beautify: true,    // keep readable formatting
      }
    })
  ]
});

export default [
  makeConfig(true, false),
  makeConfig(true, true),
  makeConfig(false, false),
  makeConfig(false, true)
];

