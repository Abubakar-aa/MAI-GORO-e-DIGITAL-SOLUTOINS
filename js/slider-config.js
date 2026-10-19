// Public Supabase configuration. Use the same values as admin/js/config.js.
const SUPABASE_URL = "https://ojulosctgnieeepaiomz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qdWxvc2N0Z25pZWVlcGFpb216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTIwMTUsImV4cCI6MjEwNTc2ODAxNX0.Zpu5t7nZGNeNCYeujVjho1wWXHO9YF0v3bb2Kk3gi64";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);