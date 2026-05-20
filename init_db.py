"""
Veritabanini SIFIRLAR ve bos tablolar olusturur.
UYARI: Tum kullanici verileri silinir!

Normal baslatma icin bu scripti calistirmaniz GEREKMEZ.
Sunucu otomatik olarak tablolari olusturur.

Kullanim: python init_db.py
"""
import sys
from app import create_app, db

app = create_app()

print("=" * 50)
print("UYARI: Bu islem veritabanindaki TUM VERIYI SILECEK!")
print("Kayitli kullanicilar, calisma alanlari ve gorevler")
print("kalici olarak silinecektir.")
print("=" * 50)
confirm = input("\nDevam etmek icin 'EVET' yazin (iptal: Enter): ").strip()
if confirm != 'EVET':
    print("Iptal edildi. Veri degistirilmedi.")
    sys.exit(0)

with app.app_context():
    from sqlalchemy import text
    
    # Tüm tabloları CASCADE ile sil (PostgreSQL)
    try:
        engine = db.engine
        with engine.connect() as conn:
            # CASCADE ile tüm tabloları sil
            conn.execute(text("""
                DO $$ DECLARE
                    r RECORD;
                BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                    END LOOP;
                END $$;
            """))
            conn.commit()
            print("Tum tablolar silindi.")
    except Exception as e:
        print(f"Tablo sil hatası: {e}")
    
    # Şimdi tabloları yeniden oluştur
    db.create_all()
    print("\nVeritabani sifirlandi ve tablolar olusturuldu.")
    print()
    print("-> python run.py ile sunucuyu baslatabilirsiniz")
    print("-> http://localhost:5000 adresine gidin")
    print("-> Kaydolun -> 'Takim Kur' ile calisma alani olusturun")
