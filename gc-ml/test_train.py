import traceback
from app.ml.trainer import train_model

try:
    print('Starting train_model()...')
    train_model()
    print('Done.')
except Exception as e:
    print('Error:')
    traceback.print_exc()
