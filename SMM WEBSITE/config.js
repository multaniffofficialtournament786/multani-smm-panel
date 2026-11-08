// MULTANI SMM VIP - Supabase Configuration
const SUPABASE_URL = 'https://mcspweilonejvqrtwmgr.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jc3B3ZWlsb25lanZxcnR3bWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMDIyNDgsImV4cCI6MjEwOTY3ODI0OH0.CpqoKdpeU4DwG_V0-f-Ni7yX131CUV8m2wXV2bJI-Yg'; 

// Initialize Supabase Client
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
