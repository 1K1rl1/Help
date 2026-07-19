from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
LOG = logging.getLogger(__name__)

@app.route('/notify', methods=['POST'])
def notify():
    payload = request.get_json(silent=True)
    LOG.info('Received notify payload: %s', payload)
    return jsonify({'status': 'received'}), 200

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    app.run(port=6000)
