const gulp = require('gulp');
const shell = require('gulp-shell');

// Task to run 'npm install'
gulp.task('install', shell.task('npm install'));

// Task to run 'npm start'
gulp.task('start', shell.task('npm start'));

// Default task to run both 'install' and 'start' sequentially
gulp.task('default', gulp.series('install', 'start'));
