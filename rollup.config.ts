import typescript from '@rollup/plugin-typescript';
import { uglify } from "rollup-plugin-uglify"
import { terser } from 'rollup-plugin-terser';
import compiler from '@ampproject/rollup-plugin-closure-compiler';
import { flattenClassesTransformer } from './ts-transformer-flatten.ts';
// import flattenClasses from './rollup.plugin.flatten-classes.ts';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap:true
  },
  plugins: [
    // flattenClasses(),
    typescript({
      transformers: {
        before:[
          {
            factory:flattenClassesTransformer,
            type:"program"
          }
        ]
      },
    }),
    // terser({
    //   compress: {
    //     inline: true,       // inline functions
    //     pure_funcs: [],     // list of functions to consider pure
    //     passes: 3,           // more passes can find more inlining opportunities
    //     toplevel:true,
    //     hoist_funs:true,
    //     hoist_vars:true,
    //   },
    //   ecma: "next"
    // }),
    // typescript(),
    // uglify({
    //   mangle: {
    //     toplevel: true
    //   }
    // }),
    // compiler(
    //   {
    //     compilation_level: 'ADVANCED'
    //   }
    // )
  ]
};