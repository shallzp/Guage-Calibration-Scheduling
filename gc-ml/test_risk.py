import traceback
from app.services.risk_services import update_all_gauge_predictions

try:
    print('Starting...')
    print(update_all_gauge_predictions())
except Exception as e:
    print('Error:')
    traceback.print_exc()
