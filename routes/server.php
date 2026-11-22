<?php

use Illuminate\Support\Facades\Route;
use ModInstaller\Http\Controllers\ModController;

Route::get('/context', [ModController::class, 'context']);
Route::get('/search', [ModController::class, 'search']);
Route::get('/versions', [ModController::class, 'versions']);
Route::post('/install', [ModController::class, 'install']);
Route::get('/installed', [ModController::class, 'installed']);
Route::post('/delete', [ModController::class, 'delete']);
