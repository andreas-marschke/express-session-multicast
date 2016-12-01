"use strict";
module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    eslint: {
      options: {
        configFile: ".eslintrc",
        format: "compact"
      },
      src: [
        "Gruntfile.js",
        "index.js",
        "lib/store.js",
        "lib/serialization.js"
      ]
    },
    mochaTest: {
      test: {
        options: {
          reporter: "tap",
          quiet: false,
          clearRequireCache: true,
          gc: true
        },
        src: [
          "test/index.js"
        ]
      }
    }
  });

  grunt.loadNpmTasks("gruntify-eslint");
  grunt.loadNpmTasks("grunt-mocha-test");

  grunt.registerTask("test", ["eslint", "mochaTest"]);
  grunt.registerTask("default", ["test"]);
};
